// Module: agent/pipelineClient
// Responsibility: Provide overridable hooks for provider-aware client functions used by the agent.

import type { ModelTransport } from '@/lib/types';
import { getTransportClient } from '@/lib/transport/registry';
import type {
  TransportChatParams,
  TransportClient,
  TransportStreamParams,
} from '@/lib/transport/types';

type ChatParams = TransportChatParams & { transport?: ModelTransport };
type StreamParams = TransportStreamParams & { transport?: ModelTransport };

type ChatHandler = (params: ChatParams) => ReturnType<TransportClient['chatCompletion']>;
type StreamHandler = (params: StreamParams) => ReturnType<TransportClient['streamChatCompletion']>;

const defaultChatRouter: ChatHandler = (params) => {
  const { transport, ...rest } = params;
  return getTransportClient(transport).chatCompletion(rest);
};

const defaultStreamRouter: StreamHandler = (params) => {
  const { transport, ...rest } = params;
  return getTransportClient(transport).streamChatCompletion(rest);
};

let chatCompletionImpl: ChatHandler = defaultChatRouter;
let streamChatCompletionImpl: StreamHandler = defaultStreamRouter;

export function getChatCompletion(): ChatHandler {
  return chatCompletionImpl;
}

export function getStreamChatCompletion(): StreamHandler {
  return streamChatCompletionImpl;
}

export function setTransportMocksForTests(overrides?: {
  chatCompletion?: ChatHandler;
  streamChatCompletion?: StreamHandler;
}) {
  chatCompletionImpl = overrides?.chatCompletion ?? defaultChatRouter;
  streamChatCompletionImpl = overrides?.streamChatCompletion ?? defaultStreamRouter;
}
