import { normalizeUsage, sumUsage } from '@/lib/api/normalizers';
import { API_ERROR_CODES, throwForStatus } from '@/lib/api/errors';
import type { TransportChatParams } from '@/lib/transport/types';
import type { ChatCompletion } from '@/lib/transport/completions';
import { anMessages } from '@/lib/anthropic/http';
import { bodyFromParams } from '@/lib/anthropic/request';
import { pickThinkingBlocks, toReasoningDetails } from '@/lib/anthropic/messages';
import type { AnthropicMessagesRequest } from '@/lib/anthropic/wire';
import {
  appendContinuationMessage,
  mapStopReason,
  MAX_PAUSE_TURN_CONTINUATIONS,
} from '@/lib/anthropic/continuation';
import { buildAnthropicError, wrapAnthropicClientError } from '@/lib/anthropic/errors';
import { isRecord } from '@/lib/utils/guards';

function buildToolCalls(content: unknown) {
  if (!Array.isArray(content)) return undefined;
  const toolCalls = content
    .map((entry, index) => {
      if (!isRecord(entry) || entry.type !== 'tool_use') return null;
      if (typeof entry.id !== 'string' || typeof entry.name !== 'string') return null;
      const input = isRecord(entry.input) ? entry.input : {};
      return {
        id: entry.id,
        type: 'function' as const,
        function: {
          name: entry.name,
          arguments: JSON.stringify(input),
        },
        index,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  return toolCalls.length > 0 ? toolCalls : undefined;
}

function buildTextContent(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .filter(
      (entry): entry is { type: 'text'; text: string } =>
        isRecord(entry) && entry.type === 'text' && typeof entry.text === 'string',
    )
    .map((entry) => entry.text)
    .join('');
}

async function requestAnthropicMessageSequence(args: {
  auth: TransportChatParams['auth'];
  body: AnthropicMessagesRequest;
  signal?: AbortSignal;
  origin?: string;
}): Promise<Record<string, unknown>> {
  let body = args.body;
  let continuations = 0;
  let combinedUsage: ReturnType<typeof normalizeUsage> | undefined;

  while (true) {
    let res: Response;
    try {
      res = await anMessages({
        auth: args.auth,
        body,
        signal: args.signal,
        origin: args.origin,
      });
    } catch (error) {
      throw wrapAnthropicClientError(error, API_ERROR_CODES.PROVIDER_CHAT_FAILED);
    }

    await throwForStatus(res, buildAnthropicError, API_ERROR_CODES.PROVIDER_CHAT_FAILED);

    const data = (await res.json()) as Record<string, unknown>;
    combinedUsage = sumUsage(combinedUsage, normalizeUsage(data.usage as Record<string, number>));
    const nextBody =
      data.stop_reason === 'pause_turn' && continuations < MAX_PAUSE_TURN_CONTINUATIONS
        ? appendContinuationMessage(body, data.content)
        : body;
    if (nextBody === body) {
      return combinedUsage ? { ...data, usage: combinedUsage } : data;
    }
    body = nextBody;
    continuations += 1;
  }
}

function mapAnthropicResponseToChatCompletion(
  data: Record<string, unknown>,
  requestedModel: string,
): ChatCompletion {
  const content = Array.isArray(data.content) ? data.content : [];
  const toolCalls = buildToolCalls(content);
  const reasoningDetails = toReasoningDetails(pickThinkingBlocks(content));

  return {
    id: typeof data.id === 'string' ? data.id : '',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: typeof data.model === 'string' ? data.model : requestedModel,
    choices: [
      {
        index: 0,
        finish_reason: mapStopReason(data.stop_reason) ?? null,
        message: {
          role: 'assistant',
          content: buildTextContent(content),
          ...(toolCalls ? { tool_calls: toolCalls } : {}),
          ...(reasoningDetails ? { reasoning_details: reasoningDetails } : {}),
        },
      },
    ],
    usage: normalizeUsage(data.usage as Record<string, number>),
  };
}

export async function chatCompletion(params: TransportChatParams): Promise<ChatCompletion> {
  const body = bodyFromParams(params, false);
  const data = await requestAnthropicMessageSequence({
    auth: params.auth,
    body,
    signal: params.signal,
    origin: params.origin,
  });
  return mapAnthropicResponseToChatCompletion(data, params.model);
}
