import { buildChatBody } from '@/lib/openrouter/request';
import { ApiError, API_ERROR_CODES } from '@/lib/api/errors';
import { normalizeUsage, shouldIncludeUsage, type Usage } from '@/lib/api/normalizers';
import { consumeSse, type SseEvent } from '@/lib/api/stream';
import { orChatCompletions } from '@/lib/openrouter/http';
import { logger } from '@/lib/logger';
import type { TransportStreamParams, ToolCallDelta, FinishReason } from '@/lib/transport/types';
import type { ToolCall } from '@/lib/transport/contracts';
import { isRecord } from '@/lib/utils/guards';
import { buildOpenRouterError, wrapOpenRouterClientError } from '@/lib/openrouter/errors';

const VALID_FINISH_REASONS = new Set(['stop', 'tool_calls', 'length', 'content_filter']);

function buildToolCalls(accumulator: Map<number, Partial<ToolCall>>): ToolCall[] {
  const result: ToolCall[] = [];
  for (const tc of accumulator.values()) {
    if (tc.id && tc.function?.name) {
      result.push({
        ...(tc as ToolCall),
        id: tc.id,
        type: 'function',
        function: {
          ...(tc.function ?? {}),
          name: tc.function.name,
          arguments: tc.function.arguments ?? '',
        },
      });
    }
  }
  return result;
}

export async function streamChatCompletion(params: TransportStreamParams): Promise<void> {
  const callbacks = params.callbacks;
  const body = buildChatBody({

    model: params.model,
    messages: params.messages,
    stream: true,
    modalities: params.modalities,
    temperature: params.temperature,
    topP: params.topP,
    maxTokens: params.maxTokens,
    reasoningEffort: params.reasoningEffort,
    reasoningTokens: params.reasoningTokens,
    disableReasoning: params.disableReasoning,
    tools: params.tools,
    toolChoice: params.toolChoice,
    parallelToolCalls: params.parallelToolCalls,
    providerSort: params.providerSort,
    plugins: params.plugins,
    includeUsage: shouldIncludeUsage(true),
  });

  let res: Response;
  try {
    res = await orChatCompletions({
      auth: params.auth,
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
  let finishReason: FinishReason | undefined;
  let reasoningDetails: unknown;
  const toolCallAccumulator = new Map<number, Partial<ToolCall>>();

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

      const deltaReasoningDetails = delta?.reasoning_details ?? message?.reasoning_details;
      if (deltaReasoningDetails !== undefined) reasoningDetails = deltaReasoningDetails;

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

      // Parse tool call deltas
      const toolCallDeltas = delta?.tool_calls;
      if (Array.isArray(toolCallDeltas) && toolCallDeltas.length > 0) {
        const parsedDeltas: ToolCallDelta[] = [];
        for (const tc of toolCallDeltas) {
          if (!isRecord(tc)) continue;
          const index = typeof tc.index === 'number' ? tc.index : 0;
          let existing = toolCallAccumulator.get(index);
          if (!existing) {
            existing = { type: 'function' as const, function: { name: '', arguments: '' } };
            toolCallAccumulator.set(index, existing);
          }
          if (typeof tc.id === 'string') existing.id = tc.id;
          if (typeof tc.type === 'string') existing.type = tc.type as 'function';
          for (const [key, value] of Object.entries(tc)) {
            if (key === 'index' || key === 'id' || key === 'type' || key === 'function') continue;
            (existing as Record<string, unknown>)[key] = value;
          }
          if (isRecord(tc.function)) {
            const fn = existing.function ?? { name: '', arguments: '' };
            if (typeof tc.function.name === 'string') {
              fn.name = fn.name + tc.function.name;
            }
            if (typeof tc.function.arguments === 'string') {
              fn.arguments = fn.arguments + tc.function.arguments;
            }
            for (const [key, value] of Object.entries(tc.function)) {
              if (key === 'name' || key === 'arguments') continue;
              (fn as Record<string, unknown>)[key] = value;
            }
            existing.function = fn;
          }
          parsedDeltas.push({
            index,
            id: typeof tc.id === 'string' ? tc.id : undefined,
            type: tc.type === 'function' ? 'function' : undefined,
            function: isRecord(tc.function)
              ? {
                  name: typeof tc.function.name === 'string' ? tc.function.name : undefined,
                  arguments:
                    typeof tc.function.arguments === 'string' ? tc.function.arguments : undefined,
                }
              : undefined,
          });
        }
        if (parsedDeltas.length > 0) callbacks?.onToolCallDelta?.(parsedDeltas);
      }

      // Capture finish reason
      const rawFinishReason = choice?.finish_reason;
      if (typeof rawFinishReason === 'string' && VALID_FINISH_REASONS.has(rawFinishReason)) {
        finishReason = rawFinishReason as FinishReason;
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

  const toolCalls = buildToolCalls(toolCallAccumulator);
  callbacks?.onDone?.(full, {
    usage,
    annotations,
    finishReason,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    reasoningDetails,
  });
}
