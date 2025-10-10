// Module: agent/pipelineClient
// Responsibility: Provide overridable hooks for OpenRouter client functions used by the agent.

import { chatCompletion, streamChatCompletion } from '@/lib/openrouter';

let chatCompletionImpl = chatCompletion;
let streamChatCompletionImpl = streamChatCompletion;

export function getChatCompletion() {
  return chatCompletionImpl;
}

export function getStreamChatCompletion() {
  return streamChatCompletionImpl;
}

export function setOpenRouterMocksForTests(overrides?: {
  chatCompletion?: typeof chatCompletion;
  streamChatCompletion?: typeof streamChatCompletion;
}) {
  chatCompletionImpl = overrides?.chatCompletion ?? chatCompletion;
  streamChatCompletionImpl = overrides?.streamChatCompletion ?? streamChatCompletion;
}
