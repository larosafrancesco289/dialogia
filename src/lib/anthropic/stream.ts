import { consumeSse } from '@/lib/api/stream';
import { sumUsage, type Usage } from '@/lib/api/normalizers';
import { ApiError, API_ERROR_CODES, throwForStatus } from '@/lib/api/errors';
import type { TransportStreamParams } from '@/lib/transport/types';
import { anMessages } from '@/lib/anthropic/http';
import { bodyFromParams } from '@/lib/anthropic/request';
import { toReasoningDetails } from '@/lib/anthropic/messages';
import {
  appendContinuationMessage,
  mapStopReason,
  MAX_PAUSE_TURN_CONTINUATIONS,
} from '@/lib/anthropic/continuation';
import {
  applyStreamEvent,
  createStreamTurn,
  finishedToolCalls,
  roundContent,
  startNextRound,
} from '@/lib/anthropic/streamEvents';
import { buildAnthropicError, wrapAnthropicClientError } from '@/lib/anthropic/errors';

export async function streamChatCompletion(params: TransportStreamParams): Promise<void> {
  const callbacks = params.callbacks;
  let body = bodyFromParams(params, true);
  const turn = createStreamTurn();
  let usage: Usage | undefined;
  let started = false;

  try {
    for (let continuations = 0; ; continuations += 1) {
      let res: Response;
      try {
        res = await anMessages({
          auth: params.auth,
          body,
          signal: params.signal,
          stream: true,
          origin: params.origin,
        });
      } catch (error) {
        throw wrapAnthropicClientError(error, API_ERROR_CODES.PROVIDER_CHAT_FAILED);
      }

      await throwForStatus(res, buildAnthropicError, API_ERROR_CODES.PROVIDER_CHAT_FAILED);

      await consumeSse(res, {
        onStart: started
          ? undefined
          : () => {
              started = true;
              callbacks?.onStart?.();
            },
        onMessage: (event) => applyStreamEvent(turn, JSON.parse(event.data), callbacks),
      });

      usage = sumUsage(usage, turn.round.usage);
      const nextBody =
        turn.stopReason === 'pause_turn' && continuations < MAX_PAUSE_TURN_CONTINUATIONS
          ? appendContinuationMessage(body, roundContent(turn))
          : body;
      if (nextBody === body) break;
      body = nextBody;
      startNextRound(turn);
    }
  } catch (error) {
    const apiError =
      error instanceof ApiError
        ? error
        : new ApiError({ code: API_ERROR_CODES.PROVIDER_CHAT_FAILED, detail: error });
    callbacks?.onError?.(apiError);
    throw apiError;
  }

  await callbacks?.onDone?.(turn.text, {
    usage,
    finishReason: mapStopReason(turn.stopReason),
    stopDetails: turn.stopDetails,
    toolCalls: finishedToolCalls(turn),
    reasoningDetails: toReasoningDetails(turn.thinkingBlocks),
  });
}
