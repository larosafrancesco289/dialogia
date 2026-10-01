import type { UIState } from '@/lib/store/types';
import type { Message } from '@/lib/types';

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

/**
 * A tool call on the reply is still being written or run. A card's arguments
 * can take many seconds to stream after the reply's words, and until the call
 * resolves the reply must not read as finished.
 */
export function toolCallInFlight(message: Pick<Message, 'toolCalls'>): boolean {
  return !!message.toolCalls?.some((call) => call.status === 'pending');
}

/**
 * The model's latest step is a line of thought still being written. A tool
 * call made after the thought began is the later step.
 */
export function thinkingNow(message: Pick<Message, 'activity' | 'toolCalls'>): boolean {
  const thought = message.activity
    ?.filter((item) => item.type === 'reasoning' && item.status !== 'done')
    .at(-1);
  if (!thought) return false;
  const steps = [...(message.activity ?? []), ...(message.toolCalls ?? [])];
  return !steps.some((step) => step !== thought && step.timestamp > thought.timestamp);
}

/**
 * Whether the pen after a running reply's words is the turn's one live mark.
 * Before the first word the reasoning line's mark (or the waiting mark) has
 * that job, and again while the model thinks; the pen takes it while a tool
 * call is written or run, or while no word arrives (`quiet`), as when the
 * model works on the round after an answer it kept. Never while words come.
 */
export function penIsLive(
  message: Pick<Message, 'content' | 'activity' | 'toolCalls'>,
  quiet: boolean,
): boolean {
  if (!message.content?.trim() || thinkingNow(message)) return false;
  return quiet || toolCallInFlight(message);
}
