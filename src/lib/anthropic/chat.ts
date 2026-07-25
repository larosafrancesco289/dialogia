import { normalizeUsage, sumUsage } from '@/lib/api/normalizers';
import { API_ERROR_CODES } from '@/lib/api/errors';
import type { TransportChatParams } from '@/lib/transport/types';
import type { ModelMessage } from '@/lib/transport/contracts';
import type { ChatCompletion } from '@/lib/transport/completions';
import { buildTransportAuth } from '@/lib/auth/transport';
import { ANTHROPIC_ENDPOINT } from '@/lib/transport/endpoints';
import { anMessages } from '@/lib/anthropic/http';
import {
  buildAnthropicBody,
  type AnthropicAssistantMessageContent,
  type AnthropicMessagesRequest,
} from '@/lib/anthropic/request';
import { buildAnthropicError, wrapAnthropicClientError } from '@/lib/anthropic/errors';
import { resolveAnthropicDirectModelId } from '@/lib/anthropic/shared';
import { isRecord } from '@/lib/utils/guards';

const MAX_PAUSE_TURN_CONTINUATIONS = 5;

function mapStopReason(value: unknown): string {
  if (value === 'tool_use') return 'tool_calls';
  if (
    value === 'max_tokens' ||
    value === 'model_context_window_exceeded' ||
    value === 'pause_turn'
  ) {
    return 'length';
  }
  if (value === 'refusal') return 'content_filter';
  return 'stop';
}

function buildReasoningDetails(content: unknown) {
  if (!Array.isArray(content)) return undefined;
  const thinkingBlocks = content
    .map((entry) => {
      if (!isRecord(entry)) return null;
      if (entry.type !== 'thinking') return null;
      if (typeof entry.signature !== 'string') return null;
      return {
        type: 'thinking',
        thinking: typeof entry.thinking === 'string' ? entry.thinking : '',
        signature: entry.signature,
      };
    })
    .filter(
      (entry): entry is { type: 'thinking'; thinking: string; signature: string } => entry !== null,
    );
  if (thinkingBlocks.length === 0) return undefined;
  return {
    provider: 'anthropic',
    thinkingBlocks,
  };
}

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

function appendContinuationMessage(
  body: AnthropicMessagesRequest,
  content: unknown,
): AnthropicMessagesRequest {
  if (!Array.isArray(content) || content.length === 0) return body;
  return {
    ...body,
    messages: [
      ...body.messages,
      {
        role: 'assistant',
        content: content as AnthropicAssistantMessageContent,
      },
    ],
  };
}

async function requestAnthropicMessageSequence(args: {
  auth: TransportChatParams['auth'];
  body: AnthropicMessagesRequest;
  signal?: AbortSignal;
  origin?: string;
}): Promise<Record<string, unknown>> {
  let body = args.body;
  let finalData: Record<string, unknown> | undefined;
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

    if (res.status === 401 || res.status === 403) {
      throw await buildAnthropicError(res, API_ERROR_CODES.UNAUTHORIZED, 'Invalid API key');
    }
    if (res.status === 429) {
      throw await buildAnthropicError(res, API_ERROR_CODES.RATE_LIMITED, 'Rate limited');
    }
    if (!res.ok) {
      throw await buildAnthropicError(res, API_ERROR_CODES.PROVIDER_CHAT_FAILED);
    }

    const data = (await res.json()) as Record<string, unknown>;
    combinedUsage = sumUsage(combinedUsage, normalizeUsage(data.usage as Record<string, number>));
    finalData = data;
    if (data.stop_reason !== 'pause_turn') {
      if (combinedUsage) finalData = { ...finalData, usage: combinedUsage };
      return finalData;
    }

    if (continuations >= MAX_PAUSE_TURN_CONTINUATIONS) {
      if (combinedUsage) finalData = { ...finalData, usage: combinedUsage };
      return finalData;
    }

    const nextBody = appendContinuationMessage(body, data.content);
    if (nextBody === body) {
      if (combinedUsage) finalData = { ...finalData, usage: combinedUsage };
      return finalData;
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
  const reasoningDetails = buildReasoningDetails(content);

  return {
    id: typeof data.id === 'string' ? data.id : '',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: typeof data.model === 'string' ? data.model : requestedModel,
    choices: [
      {
        index: 0,
        finish_reason: mapStopReason(data.stop_reason),
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
  const body = buildAnthropicBody({
    model: params.model,
    messages: params.messages,
    stream: false,
    temperature: params.temperature,
    topP: params.topP,
    maxTokens: params.maxTokens,
    reasoningEffort: params.reasoningEffort,
    reasoningTokens: params.reasoningTokens,
    disableReasoning: params.disableReasoning,
    tools: params.tools,
    toolChoice: params.toolChoice,
    plugins: params.plugins,
    enableAutomaticCaching: true,
  });
  const data = await requestAnthropicMessageSequence({
    auth: params.auth,
    body,
    signal: params.signal,
    origin: params.origin,
  });
  return mapAnthropicResponseToChatCompletion(data, params.model);
}

/**
 * Compatibility helper used by the ablation runner.
 * This intentionally routes through the same request builder as the UI transport.
 */
export async function anthropicChatCompletion({
  apiKey,
  model,
  messages,
  temperature = 0,
  maxTokens = 2048,
  enableAutomaticCaching = false,
}: {
  apiKey: string;
  model: string;
  messages: ModelMessage[];
  temperature?: number;
  maxTokens?: number;
  enableAutomaticCaching?: boolean;
}): Promise<ChatCompletion> {
  const auth = buildTransportAuth({ endpoint: ANTHROPIC_ENDPOINT, apiKey });
  const body = buildAnthropicBody({
    model,
    messages,
    stream: false,
    temperature,
    maxTokens,
    plugins: undefined,
    enableAutomaticCaching,
  });
  const data = await requestAnthropicMessageSequence({
    auth,
    body,
  });
  return mapAnthropicResponseToChatCompletion(data, model);
}

export { resolveAnthropicDirectModelId } from '@/lib/anthropic/shared';
