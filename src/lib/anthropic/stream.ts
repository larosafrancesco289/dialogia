import { ApiError, API_ERROR_CODES } from '@/lib/api/errors';
import { anthropicMessages } from '@/lib/api/anthropicClient';
import { consumeSse } from '@/lib/api/stream';
import { fromAnthropicUsage, type Usage } from '@/lib/api/normalizers';
import type { TransportStreamParams } from '@/lib/transport/types';
import type { AnthropicMessagesRequest, AnthropicToolDefinition } from '@/lib/types/transport';
import { isRecord } from '@/lib/utils/guards';
import { buildAnthropicError, wrapAnthropicClientError } from '@/lib/anthropic/errors';
import {
  DEFAULT_MAX_TOKENS,
  convertToolChoice,
  convertToolDefinition,
  partitionSystemMessages,
  toAnthropicMessages,
  toAnthropicModelId,
} from '@/lib/anthropic/shared';

type StreamParams = TransportStreamParams;

export async function streamChatCompletion(params: StreamParams): Promise<void> {
  const { system, rest } = partitionSystemMessages(params.messages);
  const anthropicMessagesPayload = toAnthropicMessages(rest);
  const tools =
    Array.isArray(params.tools) && params.tools.length
      ? params.tools
          .map(convertToolDefinition)
          .filter((tool): tool is AnthropicToolDefinition => Boolean(tool))
      : undefined;
  const body: AnthropicMessagesRequest = {
    model: toAnthropicModelId(params.model),
    max_tokens: params.max_tokens ?? DEFAULT_MAX_TOKENS,
    messages: anthropicMessagesPayload,
    temperature: typeof params.temperature === 'number' ? params.temperature : undefined,
    top_p: typeof params.top_p === 'number' ? params.top_p : undefined,
    system,
    tools,
    tool_choice: convertToolChoice(params.tool_choice),
    stream: true,
  };
  let res: Response;
  try {
    res = await anthropicMessages({
      apiKey: params.apiKey,
      body,
      signal: params.signal,
      stream: true,
      origin: params.origin,
    });
  } catch (error) {
    throw wrapAnthropicClientError(error, API_ERROR_CODES.PROVIDER_CHAT_FAILED);
  }
  if (res.status === 401 || res.status === 403) {
    throw await buildAnthropicError(
      res,
      API_ERROR_CODES.UNAUTHORIZED,
      'Invalid Anthropics API key',
    );
  }
  if (res.status === 429) {
    throw await buildAnthropicError(res, API_ERROR_CODES.RATE_LIMITED, 'Anthropic rate limited');
  }
  if (!res.ok || !res.body) {
    throw await buildAnthropicError(res, API_ERROR_CODES.PROVIDER_CHAT_FAILED);
  }

  let full = '';
  let usage: Usage | undefined;
  const callbacks = params.callbacks;

  try {
    await consumeSse(res, {
      onStart: () => callbacks?.onStart?.(),
      onMessage: ({ data }) => {
        let event: unknown;
        try {
          event = JSON.parse(data);
        } catch {
          return;
        }
        if (!isRecord(event) || typeof event.type !== 'string') return;
        switch (event.type) {
          case 'content_block_delta':
            if (isRecord(event.delta)) {
              const deltaType = event.delta.type;
              if (deltaType === 'text_delta' && typeof event.delta.text === 'string') {
                full += event.delta.text;
                callbacks?.onToken?.(event.delta.text);
              } else if (deltaType === 'thinking_delta' && typeof event.delta.text === 'string') {
                callbacks?.onReasoningToken?.(event.delta.text);
              }
            }
            break;
          case 'message_delta':
            usage = isRecord(event.usage)
              ? fromAnthropicUsage({
                  input_tokens:
                    typeof event.usage.input_tokens === 'number'
                      ? event.usage.input_tokens
                      : undefined,
                  output_tokens:
                    typeof event.usage.output_tokens === 'number'
                      ? event.usage.output_tokens
                      : undefined,
                })
              : undefined;
            break;
          case 'error': {
            const message =
              isRecord(event.error) && typeof event.error.message === 'string'
                ? event.error.message
                : 'Anthropic stream error';
            throw new ApiError({
              code: API_ERROR_CODES.PROVIDER_CHAT_FAILED,
              message,
              detail: event.error,
            });
          }
          default:
            break;
        }
      },
      onDone: () => {
        callbacks?.onDone?.(full, { usage });
      },
    });
  } catch (error) {
    const apiError =
      error instanceof ApiError
        ? error
        : new ApiError({ code: API_ERROR_CODES.PROVIDER_CHAT_FAILED, detail: error });
    callbacks?.onError?.(apiError);
    throw apiError;
  }
}
