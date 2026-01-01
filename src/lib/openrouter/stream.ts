import { buildChatBody } from '@/lib/openrouter/request';
import { ApiError, API_ERROR_CODES } from '@/lib/api/errors';
import { normalizeUsage, shouldIncludeUsage, type Usage } from '@/lib/api/normalizers';
import { consumeSse, type SseEvent } from '@/lib/api/stream';
import { orChatCompletions } from '@/lib/openrouter/http';
import { logger } from '@/lib/logger';
import type { TransportStreamParams } from '@/lib/transport/types';
import { isRecord } from '@/lib/utils/guards';
import { buildOpenRouterError, wrapOpenRouterClientError } from '@/lib/openrouter/errors';

export async function streamChatCompletion(params: TransportStreamParams): Promise<void> {
  const callbacks = params.callbacks;
  const body = buildChatBody({
    model: params.model,
    messages: params.messages,
    stream: true,
    modalities: params.modalities,
    temperature: params.temperature,
    top_p: params.top_p,
    max_tokens: params.max_tokens,
    reasoning_effort: params.reasoning_effort,
    reasoning_tokens: params.reasoning_tokens,
    tools: params.tools,
    tool_choice: params.tool_choice,
    parallel_tool_calls: params.parallel_tool_calls,
    providerSort: params.providerSort,
    plugins: params.plugins,
    includeUsage: shouldIncludeUsage(true),
  });

  let res: Response;
  try {
    res = await orChatCompletions({
      apiKey: params.apiKey,
      body,
      signal: params.signal,
      stream: true,
      origin: params.origin,
    });
  } catch (error) {
    throw wrapOpenRouterClientError(error, API_ERROR_CODES.OPENROUTER_CHAT_FAILED);
  }

  if (res.status === 401 || res.status === 403) {
    throw await buildOpenRouterError(res, API_ERROR_CODES.UNAUTHORIZED, 'Invalid API key');
  }
  if (res.status === 429) {
    throw await buildOpenRouterError(res, API_ERROR_CODES.RATE_LIMITED, 'Rate limited');
  }
  if (!res.ok) {
    const error = await buildOpenRouterError(res, API_ERROR_CODES.OPENROUTER_CHAT_FAILED);
    logger.error('[OpenRouter] Stream chat completion failed:', error.message);
    throw error;
  }

  let full = '';
  let usage: Usage | undefined;
  let annotations: unknown;

  const emitImages = (arr: unknown) => {
    if (!Array.isArray(arr)) return;
    for (const img of arr) {
      if (!isRecord(img)) continue;
      const imageUrl = isRecord(img.image_url) ? img.image_url.url : undefined;
      const url =
        typeof imageUrl === 'string' ? imageUrl : typeof img.url === 'string' ? img.url : undefined;
      if (typeof url === 'string' && url.startsWith('data:image/')) {
        callbacks?.onImage?.(url);
      }
    }
  };

  const handleMessage = (event: SseEvent) => {
    const payload = event?.data;
    if (!payload) return;
    try {
      const json = JSON.parse(payload);
      if (!isRecord(json)) return;
      const choices = Array.isArray(json.choices) ? json.choices : [];
      const choice = isRecord(choices[0]) ? choices[0] : undefined;
      const delta = choice && isRecord(choice.delta) ? choice.delta : undefined;
      const message = choice && isRecord(choice.message) ? choice.message : undefined;

      const deltaContent =
        typeof delta?.content === 'string'
          ? delta.content
          : typeof message?.content === 'string'
            ? message.content
            : '';

      const deltaReasoning =
        typeof delta?.reasoning === 'string'
          ? delta.reasoning
          : typeof message?.reasoning === 'string'
            ? message.reasoning
            : '';

      const ann = delta?.annotations ?? message?.annotations;
      if (ann !== undefined && annotations === undefined) {
        annotations = ann;
        callbacks?.onAnnotations?.(ann);
      }

      emitImages(delta?.images);
      emitImages(message?.images);

      if (deltaReasoning) callbacks?.onReasoningToken?.(deltaReasoning);
      if (deltaContent) {
        full += deltaContent;
        callbacks?.onToken?.(deltaContent);
      }

      if (isRecord(json.usage)) usage = normalizeUsage(json.usage as Record<string, number>);
    } catch {
      // swallow malformed chunk
    }
  };

  try {
    await consumeSse(res, {
      onStart: callbacks?.onStart,
      onMessage: handleMessage,
    });
  } catch (error) {
    const apiError =
      error instanceof ApiError
        ? error
        : new ApiError({ code: API_ERROR_CODES.OPENROUTER_CHAT_FAILED, detail: error });
    callbacks?.onError?.(apiError);
    throw apiError;
  }

  callbacks?.onDone?.(full, { usage, annotations });
}
