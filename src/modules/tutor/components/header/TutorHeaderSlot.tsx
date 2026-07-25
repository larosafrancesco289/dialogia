'use client';
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
import { PlanSheet } from '@/modules/tutor/components/plan/PlanSheet';
import { PlanStatusBadge } from '@/modules/tutor/components/header/PlanStatusBadge';
import { TutorToggle } from '@/modules/tutor/components/header/TutorToggle';

/**
 * The tutor module's `headerControls` slot: the mode toggle, the plan badge, and the
 * plan sheet. Reads everything it needs from the store, so the shell mounts it
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
    planSheetOpen,
    planSheetOverride,
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
      planSheetOpen: s.ui.plan?.sheetOpen ?? false,
      planSheetOverride: s.ui.plan?.sheetPlanOverride ?? null,
      planGeneration: s.selectedChatId
        ? s.ui.plan?.generationByChatId?.[s.selectedChatId]
        : undefined,
    }),
    shallow,
  );

  const {
    learningPlan,
    learnerModel,
    hasPlan,
    planProgress,
    rightPanelOpen,
    onPlanUpdate,
    onStartLesson,
    onMarkKnown,
    onConfidenceAdjust,
    onMisconceptionResolve,
    onSetConfidenceFloor,
    onFlagForReview,
    onToggleRightPanel,
    onSendPlanFeedback,
  } = usePlanCallbacks();

  const onClosePlanSheet = useCallback(() => {
    setUI({ plan: { sheetOpen: false, sheetPlanOverride: null } });
  }, [setUI]);

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
      const confirmed = window.confirm(
        'Starting a learning session will create a new chat. Continue?',
      );
      if (confirmed) {
        setUI({ overrides: { tutorMode: true } });
        await newChat();
      }
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

  const plan = planSheetOverride ?? learningPlan ?? null;

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

      {/* Kept for message-card triggers that set sheetPlanOverride */}
      <PlanSheet
        plan={plan}
        isOpen={planSheetOpen}
        onClose={onClosePlanSheet}
        onUpdate={onPlanUpdate}
        onStartLesson={onStartLesson}
        learnerModel={learnerModel}
        onMarkKnown={onMarkKnown}
        onConfidenceAdjust={onConfidenceAdjust}
        onMisconceptionResolve={onMisconceptionResolve}
        onSetConfidenceFloor={onSetConfidenceFloor}
        onFlagForReview={onFlagForReview}
        onSendFeedback={onSendPlanFeedback}
      />
    </>
  );
}
