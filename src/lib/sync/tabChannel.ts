// Module: sync/tabChannel
// Responsibility: The announcements tabs of this origin send each other about what they
// have persisted, and about replies they are writing. They carry ids, never content: a
// receiving tab reads IndexedDB itself (see `src/lib/store/tabSync.ts`).

export type TabAnnouncement =
  /** Chat rows were created or changed (rename, folder, settings). */
  | { kind: 'chats'; ids: string[] }
  /** A chat was deleted, with its messages and event log. */
  | { kind: 'chatDeleted'; id: string }
  | { kind: 'folders'; ids: string[] }
  | { kind: 'folderDeleted'; id: string }
  /** Message rows of one chat were written. */
  | { kind: 'messages'; chatId: string; ids: string[] }
  /** One chat's tutor event log changed. */
  | { kind: 'tutorEvents'; chatId: string }
  /** A backup was imported: every table may have changed. */
  | { kind: 'replaced' }
  /**
   * The sender is writing these replies in the chat (`writing: true`, repeated
   * as a heartbeat while it lasts) or has stopped (`writing: false`).
   */
  | { kind: 'streaming'; chatId: string; replyIds: string[]; writing: boolean }
  /** A tab opened: tabs writing a reply say so again. */
  | { kind: 'hello' };

export type TabChannel = {
  post(announcement: TabAnnouncement): void;
  /** Announcements from other tabs; a tab never hears its own. */
  subscribe(listener: (announcement: TabAnnouncement) => void): () => void;
};

/** The part of `BroadcastChannel` this module uses. */
export type BroadcastPort = {
  postMessage(data: unknown): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
};

const CHANNEL_NAME = 'dialogia-sync';

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');

/**
 * Another tab may run an older or newer build, so what arrives is checked
 * rather than trusted; anything this build does not understand is dropped.
 */
export function parseAnnouncement(data: unknown): TabAnnouncement | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const value = data as Record<string, unknown>;
  switch (value.kind) {
    case 'chats':
    case 'folders':
      return isStringList(value.ids) ? { kind: value.kind, ids: value.ids } : undefined;
    case 'chatDeleted':
    case 'folderDeleted':
      return typeof value.id === 'string' ? { kind: value.kind, id: value.id } : undefined;
    case 'messages':
      return typeof value.chatId === 'string' && isStringList(value.ids)
        ? { kind: 'messages', chatId: value.chatId, ids: value.ids }
        : undefined;
    case 'tutorEvents':
      return typeof value.chatId === 'string'
        ? { kind: 'tutorEvents', chatId: value.chatId }
        : undefined;
    case 'streaming':
      return typeof value.chatId === 'string' &&
        isStringList(value.replyIds) &&
        typeof value.writing === 'boolean'
        ? {
            kind: 'streaming',
            chatId: value.chatId,
            replyIds: value.replyIds,
            writing: value.writing,
          }
        : undefined;
    case 'replaced':
    case 'hello':
      return { kind: value.kind };
    default:
      return undefined;
  }
}

/**
 * A channel over the port `open` returns, opened on first use. Where there is
 * no port (Node, an old browser) every call is a no-op.
 */
export function createTabChannel(open: () => BroadcastPort | undefined): TabChannel {
  const listeners = new Set<(announcement: TabAnnouncement) => void>();
  let port: BroadcastPort | undefined;
  let opened = false;

  const ensurePort = () => {
    if (opened) return port;
    opened = true;
    try {
      port = open();
    } catch {
      port = undefined;
    }
    port?.addEventListener('message', (event) => {
      const announcement = parseAnnouncement(event.data);
      if (!announcement) return;
      for (const listener of listeners) {
        try {
          listener(announcement);
        } catch {
          // One listener's failure must not keep the others from hearing it.
        }
      }
    });
    return port;
  };

  return {
    post(announcement) {
      try {
        ensurePort()?.postMessage(announcement);
      } catch {
        // Announcing is best effort: the write itself has already succeeded.
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      ensurePort();
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const openBroadcastChannel = (): BroadcastPort | undefined =>
  typeof window !== 'undefined' && typeof BroadcastChannel === 'function'
    ? new BroadcastChannel(CHANNEL_NAME)
    : undefined;

/** This page's channel to the other tabs of the app. */
export const tabChannel = createTabChannel(openBroadcastChannel);
