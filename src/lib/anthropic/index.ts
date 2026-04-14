import type { TransportClient } from '@/lib/transport/types';
import {
  chatCompletion,
  anthropicChatCompletion,
  resolveAnthropicDirectModelId,
} from '@/lib/anthropic/chat';
import { fetchModels, clearAnthropicCachesForTest } from '@/lib/anthropic/models';
import { streamChatCompletion } from '@/lib/anthropic/stream';

export {
  anthropicChatCompletion,
  chatCompletion,
  clearAnthropicCachesForTest,
  fetchModels,
  resolveAnthropicDirectModelId,
  streamChatCompletion,
};

export const anthropicTransport: TransportClient = {
  fetchModels: (auth, opts) => fetchModels(auth, opts),
  chatCompletion,
  streamChatCompletion,
};
