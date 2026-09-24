import { buildChatBody } from '@/lib/openrouter/request';
import { endpointBodyOptions, endpointWireModelId } from '@/lib/openrouter/endpointBody';
import { API_ERROR_CODES, throwForStatus } from '@/lib/api/errors';
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
  await throwForStatus(res, buildOpenRouterError, API_ERROR_CODES.OPENROUTER_CHAT_FAILED, {
    onFailure: (error) => logger.error('[OpenRouter] Chat completion failed:', error.message),
  });
  return (await res.json()) as ChatCompletion;
}
