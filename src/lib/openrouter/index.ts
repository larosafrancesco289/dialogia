import type { TransportClient } from '@/lib/transport/types';
import { chatCompletion } from '@/lib/openrouter/chat';
import { fetchModels } from '@/lib/openrouter/models';
import { streamChatCompletion } from '@/lib/openrouter/stream';

export { fetchModels } from '@/lib/openrouter/models';
/** @internal Test seam, reached through this barrel by the tests. */
export { clearOpenRouterCachesForTest } from '@/lib/openrouter/models';
export { fetchZdrLists } from '@/lib/openrouter/zdr';

export const openrouterTransport: TransportClient = {
  fetchModels: (auth, opts) => fetchModels(auth, opts),
  chatCompletion,
  streamChatCompletion,
};
