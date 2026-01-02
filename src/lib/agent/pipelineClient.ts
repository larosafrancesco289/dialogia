// Module: agent/pipelineClient
// Responsibility: Provide overridable hooks for provider-aware client functions used by the agent.

import { getTransportClient } from '@/lib/transport/registry';
import type {
  TransportChatParams,
  TransportClient,
  TransportStreamParams,
} from '@/lib/transport/types';

type ChatParams = TransportChatParams;
type StreamParams = TransportStreamParams;

type ChatHandler = (params: ChatParams) => ReturnType<TransportClient['chatCompletion']>;
type StreamHandler = (params: StreamParams) => ReturnType<TransportClient['streamChatCompletion']>;

export type PipelineClient = {
  chatCompletion: ChatHandler;
  streamChatCompletion: StreamHandler;
};

const defaultChatRouter: ChatHandler = (params) =>
  getTransportClient(params.auth?.transport).chatCompletion(params);

const defaultStreamRouter: StreamHandler = (params) =>
  getTransportClient(params.auth?.transport).streamChatCompletion(params);

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
