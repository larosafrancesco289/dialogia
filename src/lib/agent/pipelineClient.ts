// Module: agent/pipelineClient
// Responsibility: Provide overridable hooks for provider-aware client functions used by the agent.

import type { ModelTransport } from '@/lib/types';
import {
  chatCompletion as openrouterChatCompletion,
  streamChatCompletion as openrouterStreamChatCompletion,
} from '@/lib/openrouter';
import {
  chatCompletion as anthropicChatCompletion,
  streamChatCompletion as anthropicStreamChatCompletion,
} from '@/lib/anthropic';

type ChatParams = Parameters<typeof openrouterChatCompletion>[0] & { transport?: ModelTransport };
type StreamParams = Parameters<typeof openrouterStreamChatCompletion>[0] & {
  transport?: ModelTransport;
};

type ChatHandler = (params: ChatParams) => ReturnType<typeof openrouterChatCompletion>;
type StreamHandler = (params: StreamParams) => ReturnType<typeof openrouterStreamChatCompletion>;

const defaultChatRouter: ChatHandler = (params) => {
  const { transport, ...rest } = params;
  if (transport === 'anthropic') {
    return anthropicChatCompletion(rest);
  }
  return openrouterChatCompletion(rest);
};

const defaultStreamRouter: StreamHandler = (params) => {
  const { transport, ...rest } = params;
  if (transport === 'anthropic') {
    return anthropicStreamChatCompletion(rest);
  }
  return openrouterStreamChatCompletion(rest);
};

let chatCompletionImpl: ChatHandler = defaultChatRouter;
let streamChatCompletionImpl: StreamHandler = defaultStreamRouter;

export function getChatCompletion(): ChatHandler {
  return chatCompletionImpl;
}

export function getStreamChatCompletion(): StreamHandler {
  return streamChatCompletionImpl;
}

export function setOpenRouterMocksForTests(overrides?: {
  chatCompletion?: ChatHandler;
  streamChatCompletion?: StreamHandler;
}) {
  chatCompletionImpl = overrides?.chatCompletion ?? defaultChatRouter;
  streamChatCompletionImpl = overrides?.streamChatCompletion ?? defaultStreamRouter;
}
