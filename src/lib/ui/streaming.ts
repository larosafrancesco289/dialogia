import type { UIState } from '@/lib/store/types';

export function getActiveTurnCount(ui: UIState, chatId?: string): number {
  if (!chatId) return 0;
  return ui.activeTurnByChatId[chatId] ?? 0;
}

export function isChatStreaming(ui: UIState, chatId?: string): boolean {
  return getActiveTurnCount(ui, chatId) > 0;
}

export function setActiveTurnCount(ui: UIState, chatId: string, count: number): UIState {
  const nextCount = Math.max(0, count);
  const nextMap = { ...ui.activeTurnByChatId };
  if (nextCount > 0) {
    nextMap[chatId] = nextCount;
  } else {
    delete nextMap[chatId];
  }
  return { ...ui, activeTurnByChatId: nextMap };
}

export function adjustActiveTurnCount(ui: UIState, chatId: string, delta: number): UIState {
  const current = ui.activeTurnByChatId[chatId] ?? 0;
  return setActiveTurnCount(ui, chatId, current + delta);
}

export function clearActiveTurnCount(ui: UIState, chatId?: string): UIState {
  if (!chatId) return { ...ui, activeTurnByChatId: {} };
  return setActiveTurnCount(ui, chatId, 0);
}

/**
 * Whether a chat has a reply in progress, and which message it is. This tab's
 * own turn writes the latest message; another tab names the replies it is
 * writing, whose checkpoints on disk read as cut off until it finishes.
 */
export function replyInProgress(
  streamingHere: boolean,
  latestMessageId: string | undefined,
  repliesInOtherTab: string[],
): { busy: boolean; isWriting: (messageId: string) => boolean } {
  return {
    busy: streamingHere || repliesInOtherTab.length > 0,
    isWriting: (messageId) =>
      streamingHere ? messageId === latestMessageId : repliesInOtherTab.includes(messageId),
  };
}
