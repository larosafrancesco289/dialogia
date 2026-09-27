// Module: ui/replyEnding
// Responsibility: The quiet note under a reply that ended early, so it never
// reads as finished mid-sentence.

import type { Message } from '@/lib/types';

const CUT_OFF_NOTES: Record<NonNullable<Message['cutOff']>, string> = {
  stopped: 'Stopped before the end.',
  failed: 'Cut off by an error before the end.',
  interrupted: 'Cut off: the page closed while this was being written.',
};

/** The note for a finished reply, or undefined when it ended as it should. */
export function replyEndingNote(message: Pick<Message, 'content' | 'cutOff' | 'finishReason'>) {
  if (!message.content.trim()) return undefined;
  if (message.cutOff) return CUT_OFF_NOTES[message.cutOff];
  if (message.finishReason === 'length') return 'Stopped at the length limit.';
  return undefined;
}
