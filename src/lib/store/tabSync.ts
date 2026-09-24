// Module: store/tabSync
// Responsibility: Keep this tab's chats, folders, messages and module logs in step with
// what other tabs persist, and tell the other tabs when this one starts and stops writing
// a reply. What another tab wrote is read back from IndexedDB and set into the store,
// never written again: a tab that re-saved what it adopted would announce it, and two
// tabs would echo each other forever.

import { repository } from '@/lib/db';
import { getMessagesForChat } from '@/lib/messages/indexing';
import { notifyChatDeleted, notifyEventsChangedElsewhere } from '@/lib/modules';
import { removeChatState } from '@/lib/store/chatSlice';
import type { StoreGetter, StoreSetter, StoreState } from '@/lib/store/types';
import type { TabAnnouncement, TabChannel } from '@/lib/sync/tabChannel';
import { abortTurn } from '@/lib/turns/runtime/abortControllers';
import { clearActiveTurnCount, isChatStreaming } from '@/lib/ui/streaming';

type SyncedStore = {
  getState: StoreGetter;
  setState: StoreSetter;
  subscribe: (listener: (state: StoreState, previous: StoreState) => void) => () => void;
};

/** A tab writing a reply repeats its announcement this often... */
export const REPLY_HEARTBEAT_MS = 15_000;
/** ...and one not heard from for this long (no heartbeat, no checkpoint) has gone. */
export const OTHER_TAB_REPLY_TIMEOUT_MS = 60_000;

export type TabSync = {
  /** Resolves once everything heard so far has been taken in. */
  idle: () => Promise<void>;
  /** Repeats this tab's replies and lets other tabs' silent ones go. Runs on a timer. */
  tick: () => void;
  /** The page is going away, and its replies stop here. */
  pageHidden: () => void;
  disconnect: () => void;
};

const startInterval = (fn: () => void, ms: number) => {
  const handle = setInterval(fn, ms);
  return () => clearInterval(handle);
};

const sameIds = (a: string[] | undefined, b: string[]) =>
  !!a && a.length === b.length && a.every((id, i) => id === b[i]);

/**
 * The replies a turn starting in this tab writes: the assistant messages it
 * created or replaced in the same update that counted the turn (a send's
 * placeholders, a regenerated reply). The latest reply otherwise.
 */
export function startedReplyIds(state: StoreState, previous: StoreState, chatId: string) {
  const replies = getMessagesForChat(state, chatId).filter((m) => m.role === 'assistant');
  const changed = replies.filter((m) => previous.messagesById[m.id] !== m).map((m) => m.id);
  if (changed.length) return changed;
  const latest = replies[replies.length - 1];
  return latest ? [latest.id] : [];
}

export function connectTabSync(
  store: SyncedStore,
  channel: TabChannel,
  options: { now?: () => number; every?: (fn: () => void, ms: number) => () => void } = {},
): TabSync {
  const { now = Date.now, every: schedule = startInterval } = options;
  const get = store.getState;
  const set = store.setState;

  /** Replies this tab is writing, by chat. */
  const writingHere = new Map<string, string[]>();
  /** When another tab writing a reply in a chat was last heard from. */
  const lastHeard = new Map<string, number>();
  /** Messages another tab saved in a chat this tab is writing in, taken in when it stops. */
  const deferred = new Map<string, Set<string>>();
  let replacedWhileWriting = false;
  let queue: Promise<void> = Promise.resolve();
  let stopTicker: (() => void) | undefined;

  // One announcement at a time, in the order they were sent.
  const run = (task: () => Promise<void> | void) => {
    queue = queue.then(task).catch(() => undefined);
    return queue;
  };

  const syncTicker = () => {
    const needed = writingHere.size > 0 || lastHeard.size > 0;
    if (needed && !stopTicker) stopTicker = schedule(tick, REPLY_HEARTBEAT_MS);
    if (!needed && stopTicker) {
      stopTicker();
      stopTicker = undefined;
    }
  };

  const setRepliesInOtherTab = (chatId: string, replyIds: string[] | undefined) => {
    if (replyIds) lastHeard.set(chatId, now());
    else lastHeard.delete(chatId);
    syncTicker();
    const current = get().repliesInOtherTabs[chatId];
    if (replyIds ? sameIds(current, replyIds) : !current) return;
    set((s) => {
      const repliesInOtherTabs = { ...s.repliesInOtherTabs };
      if (replyIds) repliesInOtherTabs[chatId] = replyIds;
      else delete repliesInOtherTabs[chatId];
      return { repliesInOtherTabs };
    });
  };

  const adoptChats = async (ids: string[]) => {
    const rows = await repository.loadChats(ids);
    if (!rows.length) return;
    set((s) => {
      const byId = new Map(rows.map((chat) => [chat.id, chat]));
      const known = new Set(s.chats.map((chat) => chat.id));
      return {
        chats: [
          ...rows.filter((chat) => !known.has(chat.id)),
          ...s.chats.map((chat) => byId.get(chat.id) ?? chat),
        ],
      };
    });
  };

  const adoptFolders = async (ids: string[]) => {
    const rows = await repository.loadFolders(ids);
    if (!rows.length) return;
    set((s) => {
      const byId = new Map(rows.map((folder) => [folder.id, folder]));
      const known = new Set(s.folders.map((folder) => folder.id));
      return {
        folders: [
          ...s.folders.map((folder) => byId.get(folder.id) ?? folder),
          ...rows.filter((folder) => !known.has(folder.id)),
        ],
      };
    });
  };

  const forgetChat = (chatId: string) => {
    deferred.delete(chatId);
    lastHeard.delete(chatId);
    syncTicker();
    if (!get().chats.some((chat) => chat.id === chatId)) return;
    // A reply to a chat that no longer exists is spending the person's key on nothing.
    if (isChatStreaming(get().ui, chatId)) {
      abortTurn(chatId);
      set((s) => ({ ui: clearActiveTurnCount(s.ui, chatId) }));
    }
    notifyChatDeleted({ get }, chatId);
    set((s) => removeChatState(s, chatId));
    const next = get().selectedChatId;
    if (next) {
      void get()
        .ensureChatMessagesLoaded(next)
        .catch(() => undefined);
    }
  };

  const defer = (chatId: string, ids: string[]) => {
    const pending = deferred.get(chatId) ?? new Set<string>();
    ids.forEach((id) => pending.add(id));
    deferred.set(chatId, pending);
  };

  const adoptMessages = async (chatId: string, ids: string[]) => {
    const writing = get().repliesInOtherTabs[chatId];
    if (writing && ids.some((id) => writing.includes(id))) lastHeard.set(chatId, now());
    // Never under this tab's own reply: its in-flight message is the store's, not the disk's.
    if (isChatStreaming(get().ui, chatId) || !(await get().adoptStoredMessages(chatId, ids))) {
      defer(chatId, ids);
    }
  };

  const replaceAll = async () => {
    if (writingHere.size) {
      replacedWhileWriting = true;
      return;
    }
    replacedWhileWriting = false;
    deferred.clear();
    await get().initializeApp();
  };

  const announceWriting = (chatId: string, replyIds: string[], writing: boolean) =>
    channel.post({ kind: 'streaming', chatId, replyIds, writing });

  const receive = async (announcement: TabAnnouncement) => {
    switch (announcement.kind) {
      case 'chats':
        return adoptChats(announcement.ids);
      case 'chatDeleted':
        return forgetChat(announcement.id);
      case 'folders':
        return adoptFolders(announcement.ids);
      case 'folderDeleted':
        set((s) => ({ folders: s.folders.filter((folder) => folder.id !== announcement.id) }));
        return;
      case 'messages':
        return adoptMessages(announcement.chatId, announcement.ids);
      case 'tutorEvents':
        // Modules order their own work; this queue need not wait for it.
        void notifyEventsChangedElsewhere({ get }, announcement.chatId);
        return;
      case 'replaced':
        return replaceAll();
      case 'streaming':
        if (announcement.writing) {
          setRepliesInOtherTab(announcement.chatId, announcement.replyIds);
          return;
        }
        // The finished replies are on disk: show them as they ended before
        // they stop counting as in progress, so none flashes as cut off.
        await adoptMessages(announcement.chatId, announcement.replyIds);
        setRepliesInOtherTab(announcement.chatId, undefined);
        return;
      case 'hello':
        writingHere.forEach((replyIds, chatId) => announceWriting(chatId, replyIds, true));
        return;
    }
  };

  const takeDeferred = async (chatId: string) => {
    const ids = deferred.get(chatId);
    if (!ids) return;
    deferred.delete(chatId);
    await adoptMessages(chatId, [...ids]);
  };

  // This tab's own turns, told to the others. Adopting never starts or ends
  // one, so nothing here answers another tab's announcement.
  const unsubscribeStore = store.subscribe((state, previous) => {
    const active = state.ui.activeTurnByChatId;
    const before = previous.ui.activeTurnByChatId;
    if (active === before) return;
    for (const chatId of Object.keys(active)) {
      if (before[chatId]) continue;
      const replyIds = startedReplyIds(state, previous, chatId);
      writingHere.set(chatId, replyIds);
      announceWriting(chatId, replyIds, true);
    }
    for (const chatId of Object.keys(before)) {
      if (active[chatId]) continue;
      announceWriting(chatId, writingHere.get(chatId) ?? [], false);
      writingHere.delete(chatId);
      void run(() => takeDeferred(chatId));
      if (replacedWhileWriting) void run(replaceAll);
    }
    syncTicker();
  });

  const unsubscribeChannel = channel.subscribe((announcement) => {
    void run(() => receive(announcement));
  });

  function tick() {
    writingHere.forEach((replyIds, chatId) => announceWriting(chatId, replyIds, true));
    const cutoff = now() - OTHER_TAB_REPLY_TIMEOUT_MS;
    for (const [chatId, heard] of [...lastHeard]) {
      // Its tab closed or froze without saying so: what it saved last is all there is.
      if (heard < cutoff) void run(() => setRepliesInOtherTab(chatId, undefined));
    }
  }

  // Replies already under way in other tabs make themselves known.
  channel.post({ kind: 'hello' });

  return {
    idle: () => queue,
    tick,
    pageHidden: () => {
      writingHere.forEach((replyIds, chatId) => announceWriting(chatId, replyIds, false));
    },
    disconnect: () => {
      unsubscribeStore();
      unsubscribeChannel();
      stopTicker?.();
      stopTicker = undefined;
    },
  };
}
