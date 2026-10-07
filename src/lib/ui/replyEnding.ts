// Module: ui/replyEnding
// Responsibility: The quiet note under a reply that ended early, so it never
// reads as finished mid-sentence, or as an empty block with nothing to say why.

import type { Message } from '@/lib/types';
import { t, type MessageKey } from '@/lib/i18n';
import { resolveNotice } from '@/lib/store/notices';

const CUT_OFF_NOTES: Record<NonNullable<Message['cutOff']>, MessageKey> = {
  stopped: 'ending.stopped',
  failed: 'ending.failed',
  interrupted: 'ending.interrupted',
};

// The same endings for a reply that never got its first word out.
const NOTHING_WRITTEN_NOTES: Record<NonNullable<Message['cutOff']>, MessageKey> = {
  stopped: 'ending.nothing.stopped',
  failed: 'ending.nothing.failed',
  interrupted: 'ending.nothing.interrupted',
};

/**
 * The note for a finished reply, or undefined when it ended as it should.
 * `hasModuleContent` is a card standing in for words: that reply did begin.
 */
export function replyEndingNote(
  message: Pick<Message, 'content' | 'cutOff' | 'cutOffReason' | 'finishReason'>,
  hasModuleContent = false,
): string | undefined {
  const withReason = (key: MessageKey) =>
    message.cutOffReason ? `${t(key)} ${resolveNotice(message.cutOffReason)}` : t(key);
  if (!message.content.trim()) {
    return message.cutOff && !hasModuleContent
      ? withReason(NOTHING_WRITTEN_NOTES[message.cutOff])
      : undefined;
  }
  if (message.cutOff) return withReason(CUT_OFF_NOTES[message.cutOff]);
  if (message.finishReason === 'length') return t('ending.length');
  return undefined;
}

/** What a screen reader hears as a reply stops streaming: how it ended, not only that it did. */
export function replyOutcomeAnnouncement(
  message?: Pick<Message, 'cutOff' | 'finishReason'>,
): string {
  if (message?.cutOff === 'stopped') return t('ending.announce.stopped');
  if (message?.cutOff) return t('ending.announce.failed');
  if (message?.finishReason === 'length') return t('ending.announce.length');
  return t('ending.announce.finished');
}
