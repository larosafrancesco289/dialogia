// Module: services/bootstrap
// Responsibility: Hydrate store from persisted repository data and schedule background refreshes.

import { loadRepositorySnapshot } from '@/lib/db';
import type { StoreGetter, StoreSetter } from '@/lib/store/types';
import { hydrateRepositorySnapshot } from '@/lib/services/hydrate';
import { mergeTutorMap } from '@/lib/ui/tutorState';
import { ENABLED_MODULES } from '@/lib/modules';
import { refreshZdrListsIfNeeded } from '@/lib/policy/zdr/cache';
import { ZDR_CACHE_TTL_MS } from '@/lib/policy/zdr/constants';

let zdrRefreshInterval: ReturnType<typeof setInterval> | null = null;

function scheduleZdrRefresh(set: StoreSetter, get: StoreGetter) {
  if (typeof window === 'undefined' || zdrRefreshInterval) return;
  zdrRefreshInterval = setInterval(() => {
    refreshZdrListsIfNeeded(set, get).catch(() => undefined);
  }, ZDR_CACHE_TTL_MS);
}

type WindowWithIdle = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
};

function scheduleIdle(fn: () => void) {
  const idle = (window as WindowWithIdle).requestIdleCallback;
  if (typeof idle === 'function') idle(fn, { timeout: 5000 });
  else window.setTimeout(fn, 400);
}

/**
 * Warm the remaining chats' messages one at a time during browser idle so
 * chat switches are instant without paying for the whole history at startup.
 */
function prefetchRemainingChatMessages(get: StoreGetter) {
  if (typeof window === 'undefined') return;
  const queue = get()
    .chats.map((chat) => chat.id)
    .filter((chatId) => !get().loadedMessageChatIds[chatId]);
  if (!queue.length) return;

  const runNext = () => {
    const next = queue.shift();
    if (!next) return;
    get()
      .ensureChatMessagesLoaded(next)
      .catch(() => undefined)
      .finally(() => {
        if (queue.length) scheduleIdle(runNext);
      });
  };
  scheduleIdle(runNext);
}

let inflightBootstrap: Promise<void> | null = null;

/**
 * Concurrent callers (e.g. desktop and mobile shells mounting together) share one
 * run so startup fetches are not duplicated. A later call still re-hydrates, which
 * the import flow relies on.
 */
export function bootstrapApp(set: StoreSetter, get: StoreGetter): Promise<void> {
  if (inflightBootstrap) return inflightBootstrap;
  inflightBootstrap = runBootstrap(set, get).finally(() => {
    inflightBootstrap = null;
  });
  return inflightBootstrap;
}

async function runBootstrap(set: StoreSetter, get: StoreGetter): Promise<void> {
  const snapshot = await loadRepositorySnapshot(get().selectedChatId);
  const hydrated = hydrateRepositorySnapshot(snapshot);

  const nonEmptyChatIds: Record<string, true> = {};
  for (const chatId of snapshot.chatIdsWithMessages) nonEmptyChatIds[chatId] = true;

  const loadedMessageChatIds: Record<string, true> = {};
  for (const chatId of Object.keys(snapshot.messages)) loadedMessageChatIds[chatId] = true;
  // Chats with no persisted messages have nothing to load.
  for (const chat of hydrated.chats) {
    if (!nonEmptyChatIds[chat.id]) loadedMessageChatIds[chat.id] = true;
  }

  set((s) => ({
    chats: hydrated.chats,
    folders: hydrated.folders,
    messagesById: hydrated.messagesById,
    messageIdsByChatId: hydrated.messageIdsByChatId,
    selectedChatId: hydrated.selectedChatId,
    loadedMessageChatIds,
    nonEmptyChatIds,
    ui: mergeTutorMap(s.ui, hydrated.tutorByMessageId),
  }));

  for (const appModule of ENABLED_MODULES) {
    try {
      await appModule.onBootstrap?.({ get, set });
    } catch {
      /* a module failing to warm must never block startup */
    }
  }

  prefetchRemainingChatMessages(get);

  try {
    await refreshZdrListsIfNeeded(set, get);
  } catch {
    /* ignore ZDR refresh failures */
  }

  scheduleZdrRefresh(set, get);
}
