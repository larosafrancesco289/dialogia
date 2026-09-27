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
  message: Pick<Message, 'content' | 'cutOff' | 'finishReason'>,
  hasModuleContent = false,
): string | undefined {
  if (!message.content.trim()) {
    return message.cutOff && !hasModuleContent ? NOTHING_WRITTEN_NOTES[message.cutOff] : undefined;
  }
  if (message.cutOff) return CUT_OFF_NOTES[message.cutOff];
  if (message.finishReason === 'length') return 'Stopped at the length limit.';
  return undefined;
}
