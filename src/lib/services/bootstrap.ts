// Module: services/bootstrap
// Responsibility: Hydrate store from persisted repository data and schedule background refreshes.

import { loadRepositorySnapshot } from '@/lib/db';
import type { StoreGetter, StoreSetter } from '@/lib/store/types';
import { hydrateRepositorySnapshot } from '@/lib/services/hydrate';
import { mergeTutorMap } from '@/lib/ui/tutorSelectors';
import { refreshZdrListsIfNeeded } from '@/lib/policy/zdr/cache';
import { ZDR_CACHE_TTL_MS } from '@/lib/policy/zdr/constants';

let zdrRefreshInterval: ReturnType<typeof setInterval> | null = null;

function scheduleZdrRefresh(set: StoreSetter, get: StoreGetter) {
  if (typeof window === 'undefined' || zdrRefreshInterval) return;
  zdrRefreshInterval = setInterval(() => {
    refreshZdrListsIfNeeded(set, get).catch(() => undefined);
  }, ZDR_CACHE_TTL_MS);
}

export async function bootstrapApp(set: StoreSetter, get: StoreGetter): Promise<void> {
  const snapshot = await loadRepositorySnapshot(get().selectedChatId);
  const hydrated = hydrateRepositorySnapshot(snapshot);
  set((s) => ({
    chats: hydrated.chats,
    folders: hydrated.folders,
    messagesById: hydrated.messagesById,
    messageIdsByChatId: hydrated.messageIdsByChatId,
    selectedChatId: hydrated.selectedChatId,
    ui: mergeTutorMap(s.ui, hydrated.tutorByMessageId),
  }));

  try {
    if (hydrated.selectedChatId) {
      await get().loadTutorProfileIntoUI(hydrated.selectedChatId);
    }
  } catch {
    /* ignore tutor profile preload errors */
  }

  try {
    await refreshZdrListsIfNeeded(set, get);
  } catch {
    /* ignore ZDR refresh failures */
  }

  scheduleZdrRefresh(set, get);
}
