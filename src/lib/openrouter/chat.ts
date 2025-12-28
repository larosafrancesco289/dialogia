import { buildChatBody } from '@/lib/agent/request';
import { API_ERROR_CODES } from '@/lib/api/errors';
import { orChatCompletions } from '@/lib/api/openrouterHttp';
import { logger } from '@/lib/logger';
import type { ChatCompletion } from '@/lib/transport/completions';
import type { TransportChatParams } from '@/lib/transport/types';
import { buildOpenRouterError, wrapOpenRouterClientError } from '@/lib/openrouter/errors';

// OpenAI-compatible non-streaming chat completion with optional tool support
export async function chatCompletion(params: TransportChatParams): Promise<ChatCompletion> {
  const body = buildChatBody({
    model: params.model,
    messages: params.messages,
    stream: false,
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
  });

  let res: Response;
  try {
    res = await orChatCompletions({
      apiKey: params.apiKey,
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
