import { useMemo } from 'react';
import { useChatStore } from '@/lib/store';
import type { MessagePanelProps } from '@/lib/ui/panels';
import { TutorPanel } from '@/modules/tutor/components/message/TutorPanel';
import { useTutorSession } from '@/modules/tutor/ui/useTutorSession';
import { cardsForMessage } from '@/modules/tutor/ui/messageViews';

/**
 * The tutor module's `messagePanel` slot: the cards a tutor turn put in front
 * of the learner, read from the chat's event log by message id.
 */
export function TutorMessagePanel({ message }: MessagePanelProps) {
  const { session } = useTutorSession();
  const tutorGloballyEnabled = useChatStore((s) => !!s.ui.flags.experimentalTutor);
  const isLatestAssistant = useChatStore(
    (s) => (s.messageIdsByChatId[message.chatId] ?? []).at(-1) === message.id,
  );
  const cards = useMemo(() => cardsForMessage(session, message.id), [session, message.id]);

  if (!tutorGloballyEnabled) return null;

  return (
    <TutorPanel
      chatId={message.chatId}
      messageId={message.id}
      cards={cards}
      isLatestAssistant={isLatestAssistant}
    />
  );
}
