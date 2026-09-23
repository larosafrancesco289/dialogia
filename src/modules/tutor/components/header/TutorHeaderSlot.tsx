import { useCallback } from 'react';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import { HeaderDivider } from '@/components/top-header/HeaderDivider';
import {
  selectIsTutorEnabled,
  selectMessagesForCurrentChat,
  selectNextOverrides,
} from '@/lib/store/selectors';
import { usePlanCallbacks } from '@/modules/tutor/ui/usePlanCallbacks';
import { PlanStatusBadge } from '@/modules/tutor/components/header/PlanStatusBadge';
import { TutorToggle } from '@/modules/tutor/components/header/TutorToggle';

/**
 * The tutor module's `headerControls` slot: the mode toggle and the plan badge.
 * Reads everything it needs from the store, so the shell mounts it
 * without passing props and knows nothing about learning plans.
 */
export function TutorHeaderSlot() {
  const {
    chat,
    setUI,
    newChat,
    updateChatSettings,
    clearChatMessages,
    ensureChatMessagesLoaded,
    experimentalTutor,
    forceTutorMode,
    nextTutorMode,
    tutorActive,
    planGeneration,
  } = useChatStore(
    (s) => ({
      chat: s.chats.find((c) => c.id === s.selectedChatId),
      setUI: s.setUI,
      newChat: s.newChat,
      updateChatSettings: s.updateChatSettings,
      clearChatMessages: s.clearChatMessages,
      ensureChatMessagesLoaded: s.ensureChatMessagesLoaded,
      experimentalTutor: !!s.ui.flags.experimentalTutor,
      forceTutorMode: !!s.ui.tutor?.forceMode,
      nextTutorMode: !!selectNextOverrides(s).tutorMode,
      tutorActive: selectIsTutorEnabled(s),
      planGeneration: s.selectedChatId
        ? s.ui.plan?.generationByChatId?.[s.selectedChatId]
        : undefined,
    }),
    shallow,
  );

  const { learningPlan, hasPlan, planProgress, rightPanelOpen, onToggleRightPanel } =
    usePlanCallbacks();

  const onToggleTutor = useCallback(async () => {
    if (forceTutorMode) return;

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
        await updateChatSettings({ features: { tutor: { enabled: false } } });
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
    forceTutorMode,
    newChat,
    nextTutorMode,
    setUI,
    updateChatSettings,
  ]);

  return (
    <>
      {experimentalTutor && (
        <>
          <TutorToggle
            active={tutorActive}
            forceTutorMode={forceTutorMode}
            onToggle={onToggleTutor}
          />
          <HeaderDivider />
        </>
      )}

      {tutorActive && hasPlan && (
        <>
          <PlanStatusBadge
            planGeneration={planGeneration}
            hasPlan={hasPlan}
            planProgress={planProgress}
            learningPlan={learningPlan}
            panelOpen={rightPanelOpen}
            onToggleRightPanel={onToggleRightPanel}
          />
          <HeaderDivider />
        </>
      )}
    </>
  );
}
