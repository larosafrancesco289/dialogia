import type { TransportClient } from '@/lib/transport/types';
import { chatCompletion } from '@/lib/anthropic/chat';
import { fetchModels, clearAnthropicCachesForTest } from '@/lib/anthropic/models';
import { streamChatCompletion } from '@/lib/anthropic/stream';

export { chatCompletion, fetchModels, streamChatCompletion };
/** @internal Test seam, reached through this barrel by the test helpers. */
export { clearAnthropicCachesForTest };

export const anthropicTransport: TransportClient = {
  fetchModels: (auth, opts) => fetchModels(auth, opts),
  chatCompletion,
  streamChatCompletion,
};
