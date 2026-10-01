// Module: ui/replyEnding
// Responsibility: The quiet note under a reply that ended early, so it never
// reads as finished mid-sentence, or as an empty block with nothing to say why.

import type { Message } from '@/lib/types';

const CUT_OFF_NOTES: Record<NonNullable<Message['cutOff']>, string> = {
  stopped: 'Stopped before the end.',
  failed: 'Cut off by an error before the end.',
  interrupted: 'Cut off: the page closed while this was being written.',
};

// The same endings for a reply that never got its first word out.
const NOTHING_WRITTEN_NOTES: Record<NonNullable<Message['cutOff']>, string> = {
  stopped: 'Stopped before the reply began.',
  failed: 'This reply failed before it started.',
  interrupted: 'The page closed before this reply began.',
};

/**
 * The note for a finished reply, or undefined when it ended as it should.
 * `hasModuleContent` is a card standing in for words: that reply did begin.
 */
export function replyEndingNote(
  message: Pick<Message, 'content' | 'cutOff' | 'cutOffReason' | 'finishReason'>,
  hasModuleContent = false,
): string | undefined {
  const withReason = (note: string) =>
    message.cutOffReason ? `${note} ${message.cutOffReason}` : note;
  if (!message.content.trim()) {
    return message.cutOff && !hasModuleContent
      ? withReason(NOTHING_WRITTEN_NOTES[message.cutOff])
      : undefined;
  }
  if (message.cutOff) return withReason(CUT_OFF_NOTES[message.cutOff]);
  if (message.finishReason === 'length') return 'Stopped at the length limit.';
  return undefined;
}

/** What a screen reader hears as a reply stops streaming: how it ended, not only that it did. */
export function replyOutcomeAnnouncement(
  message?: Pick<Message, 'cutOff' | 'finishReason'>,
): string {
  if (message?.cutOff === 'stopped') return 'Response stopped';
  if (message?.cutOff) return 'Response failed';
  if (message?.finishReason === 'length') return 'Response stopped at the length limit';
  return 'Response complete';
}
