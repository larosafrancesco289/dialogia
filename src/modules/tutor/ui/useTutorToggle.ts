import { useCallback } from 'react';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import {
  selectIsTutorEnabled,
  selectMessagesForCurrentChat,
  selectNextOverrides,
} from '@/lib/store/selectors';

export type TutorToggleState = {
  /** The Tutor mode is offered at all (Settings > Tutor). */
  available: boolean;
  active: boolean;
  /** Every chat is a tutoring session; the toggle can't turn it off. */
  forced: boolean;
  toggle: () => Promise<void>;
};

/**
 * Starting and leaving a tutoring session, shared by the desktop header's
 * Tutor button and the phone drawer's Tutor row. A session starts on a fresh
 * page and leaving one opens a new chat, so the session stays in history.
 */
export function useTutorToggle(): TutorToggleState {
  const {
    chat,
    setUI,
    newChat,
    updateChatSettings,
    clearChatMessages,
    ensureChatMessagesLoaded,
    available,
    forced,
    nextTutorMode,
    active,
  } = useChatStore(
    (s) => ({
      chat: s.chats.find((c) => c.id === s.selectedChatId),
      setUI: s.setUI,
      newChat: s.newChat,
      updateChatSettings: s.updateChatSettings,
      clearChatMessages: s.clearChatMessages,
      ensureChatMessagesLoaded: s.ensureChatMessagesLoaded,
      available: !!s.ui.flags.experimentalTutor,
      forced: !!s.ui.tutor?.forceMode,
      nextTutorMode: !!selectNextOverrides(s).tutorMode,
      active: selectIsTutorEnabled(s),
    }),
    shallow,
  );

  const toggle = useCallback(async () => {
    if (forced) return;

    if (!chat) {
      setUI({ overrides: { tutorMode: !nextTutorMode } });
      return;
    }

    const chatId = chat.id;
    await ensureChatMessagesLoaded(chatId);
    const latestState = useChatStore.getState();
    if (latestState.selectedChatId !== chatId) return;
    const latestChat = latestState.chats.find((candidate) => candidate.id === chatId) ?? chat;
    const latestMessages = selectMessagesForCurrentChat(latestState);

    const isTutorChat = latestChat.settings.features.tutor?.enabled;
    const hasUserMessages = latestMessages.some((m) => m.role === 'user');

    if (isTutorChat) {
      if (hasUserMessages) {
        setUI({ overrides: { tutorMode: false } });
        await newChat();
      } else {
        clearChatMessages();
        // Back to the model the chat had before the lesson took it over.
        const previousModelId = latestChat.settings.features.tutor?.modelIdBeforeTutor;
        await updateChatSettings({
          ...(previousModelId ? { modelId: previousModelId } : {}),
          features: { tutor: { enabled: false, modelIdBeforeTutor: undefined } },
        });
      }
    } else if (hasUserMessages) {
      // A lesson starts on a fresh page; this chat stays where it is, so
      // there is nothing to confirm.
      setUI({ overrides: { tutorMode: true } });
      await newChat();
    } else {
      await updateChatSettings({ features: { tutor: { enabled: true } } });
    }
  }, [
    chat,
    clearChatMessages,
    ensureChatMessagesLoaded,
    forced,
    newChat,
    nextTutorMode,
    setUI,
    updateChatSettings,
  ]);

  return { available, active, forced, toggle };
}
