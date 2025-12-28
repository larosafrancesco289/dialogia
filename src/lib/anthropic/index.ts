import type { TransportClient } from '@/lib/transport/types';
import { chatCompletion } from '@/lib/anthropic/messages';
import { fetchModels } from '@/lib/anthropic/models';
import { streamChatCompletion } from '@/lib/anthropic/stream';

export { chatCompletion } from '@/lib/anthropic/messages';
export { fetchModels } from '@/lib/anthropic/models';
export { streamChatCompletion } from '@/lib/anthropic/stream';

export const anthropicTransport: TransportClient = {
  fetchModels: (apiKey, opts) => fetchModels(apiKey, opts),
  chatCompletion,
  streamChatCompletion,
};
