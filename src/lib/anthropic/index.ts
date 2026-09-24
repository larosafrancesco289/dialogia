import type { TransportClient } from '@/lib/transport/types';
import { chatCompletion } from '@/lib/anthropic/chat';
import { fetchModels } from '@/lib/anthropic/models';
import { streamChatCompletion } from '@/lib/anthropic/stream';

export { chatCompletion, fetchModels, streamChatCompletion };

export const anthropicTransport: TransportClient = {
  fetchModels: (auth, opts) => fetchModels(auth, opts),
  chatCompletion,
  streamChatCompletion,
};
