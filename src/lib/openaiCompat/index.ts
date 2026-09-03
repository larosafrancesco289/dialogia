// Module: openaiCompat
// Responsibility: The transport for user-configured OpenAI-compatible servers
// (Ollama, LM Studio, llama.cpp, vLLM).
//
// It is deliberately the OpenRouter client with two things taken away: the body
// builder emits only what the endpoint's capabilities declare (see
// `openrouter/endpointBody.ts`), and the HTTP layer drops the
// `X-Title`/`HTTP-Referer` courtesy headers in favour of the endpoint's own
// base URL. Everything else — the SSE contract, tool-call accumulation, error
// mapping — is the same wire protocol and must not be forked.

import type { TransportClient } from '@/lib/transport/types';
import { chatCompletion } from '@/lib/openrouter/chat';
import { streamChatCompletion } from '@/lib/openrouter/stream';
import { fetchModels } from '@/lib/openaiCompat/models';

export { fetchModels };

export const openaiCompatTransport: TransportClient = {
  fetchModels: (auth, opts) => fetchModels(auth, opts),
  chatCompletion,
  streamChatCompletion,
};
