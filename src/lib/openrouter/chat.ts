import { buildChatBody } from '@/lib/openrouter/request';
import { endpointBodyOptions, endpointWireModelId } from '@/lib/openrouter/endpointBody';
import { API_ERROR_CODES } from '@/lib/api/errors';
import { orChatCompletions } from '@/lib/openrouter/http';
import { logger } from '@/lib/logger';
import type { ChatCompletion } from '@/lib/transport/completions';
import type { TransportChatParams } from '@/lib/transport/types';
import { buildOpenRouterError, wrapOpenRouterClientError } from '@/lib/openrouter/errors';

// OpenAI-compatible non-streaming chat completion with optional tool support
export async function chatCompletion(params: TransportChatParams): Promise<ChatCompletion> {
  const body = buildChatBody({
    ...endpointBodyOptions(params.auth),
    model: endpointWireModelId(params.auth, params.model),
    messages: params.messages,
    stream: false,
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
    zdrOnly: params.zdrOnly,
    plugins: params.plugins,
  });

  let res: Response;
  try {
    res = await orChatCompletions({
      auth: params.auth,
      body,
      signal: params.signal,
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
    logger.error('[OpenRouter] Chat completion failed:', error.message);
    throw error;
  }
  return (await res.json()) as ChatCompletion;
}
