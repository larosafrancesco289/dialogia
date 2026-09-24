import { consumeSse } from '@/lib/api/stream';
import { mergeUsage, normalizeUsage, sumUsage, type Usage } from '@/lib/api/normalizers';
import { ApiError, API_ERROR_CODES } from '@/lib/api/errors';
import type { TransportStreamParams, FinishReason, ToolCallDelta } from '@/lib/transport/types';
import type { ToolCall } from '@/lib/transport/contracts';
import { isRecord } from '@/lib/utils/guards';
import { anMessages } from '@/lib/anthropic/http';
import { bodyFromParams } from '@/lib/anthropic/request';
import { parseToolInput, toReasoningDetails } from '@/lib/anthropic/messages';
import type { AnthropicThinkingBlock } from '@/lib/anthropic/wire';
import {
  appendContinuationMessage,
  mapStopReason,
  MAX_PAUSE_TURN_CONTINUATIONS,
} from '@/lib/anthropic/continuation';
import { buildAnthropicError, wrapAnthropicClientError } from '@/lib/anthropic/errors';

type PendingThinkingBlock = {
  thinking: string;
  signature?: string;
};

export async function streamChatCompletion(params: TransportStreamParams): Promise<void> {
  const callbacks = params.callbacks;
  let body = bodyFromParams(params, true);

  let full = '';
  let usage: Usage | undefined;
  let finishReason: FinishReason | undefined;
  let rawStopDetails: unknown;
  const toolCalls = new Map<number, Partial<ToolCall>>();
  const completedThinkingBlocks: AnthropicThinkingBlock[] = [];
  let started = false;

  const emitToolCallName = (index: number, name?: string) => {
    if (!name) return;
    const delta: ToolCallDelta = {
      index,
      function: { name },
    };
    callbacks?.onToolCallDelta?.([delta]);
  };

  try {
    let continuations = 0;
    let rawStopReason: unknown;
    // A continuation numbers its content blocks from 0 again. Tool calls
    // outlive their round, so they are keyed past every earlier round's blocks.
    let toolCallBase = 0;

    while (true) {
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

      if (res.status === 401 || res.status === 403) {
        throw await buildAnthropicError(res, API_ERROR_CODES.UNAUTHORIZED, 'Invalid API key');
      }
      if (res.status === 429) {
        throw await buildAnthropicError(res, API_ERROR_CODES.RATE_LIMITED, 'Rate limited');
      }
      if (!res.ok) {
        throw await buildAnthropicError(res, API_ERROR_CODES.PROVIDER_CHAT_FAILED);
      }

      let requestUsage: Usage | undefined;
      const assistantBlocks: Array<Record<string, unknown> | undefined> = [];
      const toolInputBuffers = new Map<number, string>();
      const thinkingBlocks = new Map<number, PendingThinkingBlock>();

      const handleEvent = (payload: unknown) => {
        if (!isRecord(payload)) return;
        if (payload.type === 'ping') return;
        if (payload.type === 'error') {
          const detail = isRecord(payload.error) ? payload.error : payload;
          const message =
            typeof detail.message === 'string'
              ? detail.message
              : typeof detail.error === 'string'
                ? detail.error
                : 'Anthropic stream error';
          throw new ApiError({
            code:
              typeof detail.type === 'string' && detail.type.includes('rate')
                ? API_ERROR_CODES.RATE_LIMITED
                : API_ERROR_CODES.PROVIDER_CHAT_FAILED,
            message,
            detail,
          });
        }

        if (payload.type === 'message_start' && isRecord(payload.message)) {
          requestUsage = mergeUsage(
            requestUsage,
            normalizeUsage(payload.message.usage as Record<string, number>),
          );
          return;
        }

        if (payload.type === 'content_block_start') {
          const index = typeof payload.index === 'number' ? payload.index : 0;
          const block = isRecord(payload.content_block) ? payload.content_block : undefined;
          if (!block) return;

          assistantBlocks[index] = { ...block };

          if (block.type === 'tool_use') {
            const key = toolCallBase + index;
            const existing = toolCalls.get(key) ?? {
              type: 'function' as const,
              function: { name: '', arguments: '' },
            };
            if (typeof block.id === 'string') existing.id = block.id;
            if (typeof block.name === 'string') {
              existing.function = {
                ...(existing.function ?? { arguments: '' }),
                name: block.name,
                arguments: existing.function?.arguments ?? '',
              };
              emitToolCallName(key, block.name);
            }
            toolCalls.set(key, existing);
            if (isRecord(block.input) && Object.keys(block.input).length > 0) {
              const args = JSON.stringify(block.input);
              existing.function = {
                ...(existing.function ?? { name: '' }),
                name: existing.function?.name ?? '',
                arguments: args,
              };
              toolInputBuffers.set(index, args);
            }
            return;
          }

          if (block.type === 'thinking') {
            thinkingBlocks.set(index, { thinking: '' });
          }
          return;
        }

        if (payload.type === 'content_block_delta') {
          const index = typeof payload.index === 'number' ? payload.index : 0;
          const delta = isRecord(payload.delta) ? payload.delta : undefined;
          if (!delta) return;

          if (delta.type === 'text_delta' && typeof delta.text === 'string') {
            full += delta.text;
            callbacks?.onToken?.(delta.text);
            const block = assistantBlocks[index];
            if (isRecord(block) && block.type === 'text') {
              const current = typeof block.text === 'string' ? block.text : '';
              block.text = `${current}${delta.text}`;
            }
            return;
          }

          if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
            const current = thinkingBlocks.get(index) ?? { thinking: '' };
            current.thinking += delta.thinking;
            thinkingBlocks.set(index, current);
            callbacks?.onReasoningToken?.(delta.thinking);
            const block = assistantBlocks[index];
            if (isRecord(block) && block.type === 'thinking') {
              const priorThinking = typeof block.thinking === 'string' ? block.thinking : '';
              block.thinking = `${priorThinking}${delta.thinking}`;
            }
            return;
          }

          if (delta.type === 'signature_delta' && typeof delta.signature === 'string') {
            const current = thinkingBlocks.get(index) ?? { thinking: '' };
            current.signature = delta.signature;
            thinkingBlocks.set(index, current);
            const block = assistantBlocks[index];
            if (isRecord(block) && block.type === 'thinking') {
              block.signature = delta.signature;
            }
            return;
          }

          if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
            toolInputBuffers.set(
              index,
              `${toolInputBuffers.get(index) ?? ''}${delta.partial_json}`,
            );
          }
          return;
        }

        if (payload.type === 'content_block_stop') {
          const index = typeof payload.index === 'number' ? payload.index : 0;
          const thinking = thinkingBlocks.get(index);
          if (thinking?.signature) {
            completedThinkingBlocks.push({
              type: 'thinking',
              thinking: thinking.thinking,
              signature: thinking.signature,
            });
            thinkingBlocks.delete(index);
          }

          const parsedArgs = parseToolInput(toolInputBuffers.get(index));
          const block = assistantBlocks[index];
          if (isRecord(block) && (block.type === 'tool_use' || block.type === 'server_tool_use')) {
            block.input = parsedArgs;
          }

          const existingToolCall = toolCalls.get(toolCallBase + index);
          if (existingToolCall) {
            existingToolCall.function = {
              ...(existingToolCall.function ?? { name: '' }),
              name: existingToolCall.function?.name ?? '',
              arguments: JSON.stringify(parsedArgs),
            };
            toolCalls.set(toolCallBase + index, existingToolCall);
          }
          return;
        }

        if (payload.type === 'message_delta') {
          rawStopReason = isRecord(payload.delta) ? payload.delta.stop_reason : undefined;
          if (isRecord(payload.delta) && payload.delta.stop_details !== undefined) {
            rawStopDetails = payload.delta.stop_details;
          }
          requestUsage = mergeUsage(
            requestUsage,
            normalizeUsage(payload.usage as Record<string, number>),
          );
        }
      };

      await consumeSse(res, {
        onStart: started
          ? undefined
          : () => {
              started = true;
              callbacks?.onStart?.();
            },
        onMessage: (event) => {
          const json = JSON.parse(event.data);
          handleEvent(json);
        },
      });

      usage = sumUsage(usage, requestUsage);
      finishReason = mapStopReason(rawStopReason);

      if (rawStopReason !== 'pause_turn') {
        break;
      }

      if (continuations >= MAX_PAUSE_TURN_CONTINUATIONS) {
        break;
      }

      const continuationContent = assistantBlocks.filter(
        (block): block is Record<string, unknown> => block !== undefined,
      );
      const nextBody = appendContinuationMessage(body, continuationContent);
      if (nextBody === body) {
        break;
      }
      body = nextBody;
      continuations += 1;
      toolCallBase += assistantBlocks.length;
    }
  } catch (error) {
    const apiError =
      error instanceof ApiError
        ? error
        : new ApiError({ code: API_ERROR_CODES.PROVIDER_CHAT_FAILED, detail: error });
    callbacks?.onError?.(apiError);
    throw apiError;
  }

  const finalizedToolCalls = Array.from(toolCalls.values())
    .filter(
      (call): call is ToolCall =>
        typeof call.id === 'string' &&
        typeof call.function?.name === 'string' &&
        typeof call.function?.arguments === 'string',
    )
    .map((call) => ({
      ...call,
      id: call.id,
      type: 'function' as const,
      function: {
        name: call.function.name,
        arguments: call.function.arguments,
      },
    }));

  await callbacks?.onDone?.(full, {
    usage,
    finishReason,
    stopDetails: rawStopDetails,
    toolCalls: finalizedToolCalls.length > 0 ? finalizedToolCalls : undefined,
    reasoningDetails: toReasoningDetails(completedThinkingBlocks),
  });
}
