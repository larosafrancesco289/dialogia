// Module: tutor ui ledger
// Responsibility: sending the ledger lines a learner's turn-taking actions leave in the
// transcript (their words live in `lib/ledger`). Each is a short fact the learner sees and
// the tutor reads as their message; the change itself has already gone through `dispatchTutor`.

import { useCallback } from 'react';
import { useChatStore } from '@/lib/store';
import { isChatStreaming } from '@/lib/ui/streaming';
import { createSerialQueue } from '@/modules/tutor/lib/serial';

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
 * Lines go out one at a time, each after the reply to the one before. Two
 * actions taken while a reply streams (a card finished, then a Hub choice)
 * would otherwise both see the chat go idle at once and start two turns
 * side by side.
 */
const enqueue = createSerialQueue();

/**
 * Sends a ledger line: a visible, quiet user message that starts the tutor's
 * turn. An action taken while a reply streams waits for it; if the learner has
 * moved to another chat by then, the line is dropped (the change itself
 * stands, and the tutor reads it from the state block).
 */
export function useLedger(): (line: string) => Promise<void> {
  const sendUserMessage = useChatStore((s) => s.sendUserMessage);
  return useCallback(
    (line: string) => {
      const chatId = useChatStore.getState().selectedChatId;
      if (!chatId) return Promise.resolve();
      return enqueue(async () => {
        await whenIdle(chatId);
        if (useChatStore.getState().selectedChatId !== chatId) return;
        await sendUserMessage(line, { ledger: true });
      });
    },
    [sendUserMessage],
  );
}
