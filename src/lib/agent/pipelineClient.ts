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

export type PipelineClient = {
  chatCompletion: ChatHandler;
  streamChatCompletion: StreamHandler;
};

const defaultChatRouter: ChatHandler = (params) => {
  const { transport, ...rest } = params;
  return getTransportClient(transport).chatCompletion(rest);
};

const defaultStreamRouter: StreamHandler = (params) => {
  const { transport, ...rest } = params;
  return getTransportClient(transport).streamChatCompletion(rest);
};

export function createPipelineClient(overrides?: Partial<PipelineClient>): PipelineClient {
  return {
    chatCompletion: overrides?.chatCompletion ?? defaultChatRouter,
    streamChatCompletion: overrides?.streamChatCompletion ?? defaultStreamRouter,
  };
}

export function getChatCompletion(client?: PipelineClient): ChatHandler {
  return client?.chatCompletion ?? defaultChatRouter;
}

export function getStreamChatCompletion(client?: PipelineClient): StreamHandler {
  return client?.streamChatCompletion ?? defaultStreamRouter;
}
