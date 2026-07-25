import type { TransportClient } from '@/lib/transport/types';
import { chatCompletion } from '@/lib/openrouter/chat';
import { fetchModels } from '@/lib/openrouter/models';
import { streamChatCompletion } from '@/lib/openrouter/stream';

export { chatCompletion } from '@/lib/openrouter/chat';
export { fetchModels, clearOpenRouterCachesForTest } from '@/lib/openrouter/models';
export { streamChatCompletion } from '@/lib/openrouter/stream';
export { fetchZdrLists } from '@/lib/openrouter/zdr';

export const openrouterTransport: TransportClient = {
  fetchModels: (auth, opts) => fetchModels(auth, opts),
  chatCompletion,
  streamChatCompletion,
};
