// Module: sync/chatPresence
// Responsibility: Which chats the other tabs have open, so tidying away an empty chat never
// pulls one from under a tab sitting in it. Each tab holds a Web Lock named for the chat it
// has open; a tab that closes or crashes lets go of its lock with it.

/** The part of `navigator.locks` this module uses. */
export type LockPort = {
  request(name: string, callback: () => Promise<void>): Promise<unknown>;
  query(): Promise<{ held?: { name?: string }[] }>;
};

export type ChatPresence = {
  /** This tab now has this chat open (or none). */
  hold(chatId: string | undefined): void;
  /** Chats another tab has open. Empty where the browser cannot say. */
  openElsewhere(): Promise<Set<string>>;
};

const PREFIX = 'dialogia-open-chat:';

export function createChatPresence(
  locks: LockPort | undefined,
  tabId: string = crypto.randomUUID(),
): ChatPresence {
  let heldChatId: string | undefined;
  let release: (() => void) | undefined;
  const suffix = `:${tabId}`;

  return {
    hold(chatId) {
      if (chatId === heldChatId) return;
      release?.();
      release = undefined;
      heldChatId = chatId;
      if (!locks || !chatId) return;
      // Settled by the next `hold`, granted or not: a lock granted after its
      // release was asked for is let go at once.
      const held = new Promise<void>((resolve) => (release = resolve));
      locks.request(`${PREFIX}${chatId}${suffix}`, () => held).catch(() => undefined);
    },
    async openElsewhere() {
      const open = new Set<string>();
      if (!locks) return open;
      try {
        const { held = [] } = await locks.query();
        for (const { name } of held) {
          if (!name?.startsWith(PREFIX) || name.endsWith(suffix)) continue;
          open.add(name.slice(PREFIX.length, name.lastIndexOf(':')));
        }
      } catch {
        // Nothing known: callers fall back on their own caution.
      }
      return open;
    },
  };
}

const browserLocks = (): LockPort | undefined =>
  typeof navigator !== 'undefined' && navigator.locks ? navigator.locks : undefined;

/** This page's presence among the app's tabs. */
export const chatPresence = createChatPresence(browserLocks());
