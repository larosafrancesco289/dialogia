// Module: tutor ui ledger
// Responsibility: the ledger lines a learner's turn-taking actions leave in the transcript.
// Each is a short fact the learner sees and the tutor reads as their message; the change
// itself has already gone through `dispatchTutor`.

import { useCallback } from 'react';
import { useChatStore } from '@/lib/store';
import { isChatStreaming } from '@/lib/ui/streaming';
import { inSentence } from '@/modules/tutor/ui/text';

const score = (right: number, total: number) => `${right} of ${total} right`;

export const LEDGER = {
  intakeAnswered: () => 'Answered the intake questions',
  quizFinished: (right: number, total: number) => `Answered the quiz: ${score(right, total)}`,
  diagnosticFinished: (right: number, total: number) =>
    `Finished the diagnostic: ${score(right, total)}`,
  planApproved: () => 'Approved the plan',
  planDeclined: (feedback: string) => `Asked for changes to the plan: ${feedback.trim()}`,
  goingOn: (topic: string) => `Going on to ${inSentence(topic)}`,
  morePractice: (topic: string) => `Asked for more practice on ${inSentence(topic)}`,
  startedTopic: (topic: string) => `Chose ${inSentence(topic)} next`,
  markedKnown: (topic: string) => `Marked ${inSentence(topic)} as already known`,
  reopenedTopic: (topic: string) => `Took up ${inSentence(topic)} again`,
} as const;

/** Resolves once the chat has no reply streaming, so a line never cuts a reply short. */
function whenIdle(chatId: string): Promise<void> {
  if (!isChatStreaming(useChatStore.getState().ui, chatId)) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = useChatStore.subscribe((state) => {
      if (isChatStreaming(state.ui, chatId)) return;
      unsubscribe();
      resolve();
    });
  });
}

/**
 * Sends a ledger line: a visible, quiet user message that starts the tutor's
 * turn. An action taken while a reply streams waits for it; if the learner has
 * moved to another chat by then, the line is dropped (the change itself
 * stands, and the tutor reads it from the state block).
 */
export function useLedger(): (line: string) => Promise<void> {
  const sendUserMessage = useChatStore((s) => s.sendUserMessage);
  return useCallback(
    async (line: string) => {
      const chatId = useChatStore.getState().selectedChatId;
      if (!chatId) return;
      await whenIdle(chatId);
      if (useChatStore.getState().selectedChatId !== chatId) return;
      await sendUserMessage(line, { ledger: true });
    },
    [sendUserMessage],
  );
}
