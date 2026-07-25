'use client';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import type { MessagePanelProps } from '@/lib/ui/panels';
import { selectTutorEntry } from '@/lib/ui/tutorState';
import { TutorPanel } from '@/modules/tutor/components/message/TutorPanel';

/**
 * The tutor module's `messagePanel` slot: the interactive widgets a tutor turn
 * produced. Resolves its own payload from the store so the shell passes only the
 * message.
 */
export function TutorMessagePanel({ message }: MessagePanelProps) {
  const { tutorEntry, tutorGloballyEnabled, isLatestAssistant } = useChatStore(
    (s) => ({
      tutorEntry: selectTutorEntry(s.ui, message.id) ?? message.tutor,
      tutorGloballyEnabled: !!s.ui.flags.experimentalTutor,
      isLatestAssistant: (s.messageIdsByChatId[message.chatId] ?? []).at(-1) === message.id,
    }),
    shallow,
  );

  if (!tutorGloballyEnabled || !tutorEntry) return null;

  return (
    <TutorPanel
      messageId={message.id}
      title={tutorEntry.title}
      mcq={tutorEntry.mcq}
      questionnaire={tutorEntry.questionnaire}
      diagnostic={tutorEntry.diagnostic}
      planProposal={tutorEntry.planProposal}
      planSuggestions={tutorEntry.planSuggestions}
      assessmentUpdates={tutorEntry.assessmentUpdates}
      isLatestAssistant={isLatestAssistant}
    />
  );
}
