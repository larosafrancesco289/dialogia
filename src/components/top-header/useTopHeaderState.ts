import { useCallback, useEffect, useMemo, useRef } from 'react';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import { findModelById, formatModelLabel } from '@/lib/models';
import { calculatePlanProgress, getNextNode, updateNodeStatus } from '@/lib/learningPlan/service';
import { getLatestLearnerModel } from '@/lib/agent/learnerModel';
import { isTutorRuntimeEnabled } from '@/lib/policy/runtime';
import { selectCurrentChat, selectMessagesForCurrentChat } from '@/lib/store/selectors';
import type { UiNextOverrides, UiPlanSnapshot } from '@/lib/contracts/ui';
import type { Chat, LearnerModel, LearningPlan } from '@/lib/types';

const EMPTY_OVERRIDES: UiNextOverrides = {};

type PlanProgress = ReturnType<typeof calculatePlanProgress>;
type PlanNode = ReturnType<typeof getNextNode>;
type PlanGeneration = NonNullable<UiPlanSnapshot['generationByChatId']>[string];

export type TopHeaderState = {
  chat?: Chat;
  collapsed: boolean;
  isSettingsOpen: boolean;
  planSheetOpen: boolean;
  planSheetOverride: LearningPlan | null;
  planGeneration?: PlanGeneration;
  tutorActive: boolean;
  tutorModelLabel: string;
  experimentalTutor: boolean;
  forceTutorMode: boolean;
  nextTutorMode: boolean;
  hasPlan: boolean;
  learningPlan?: LearningPlan;
  planProgress: PlanProgress | null;
  currentNode: PlanNode;
  learnerModel?: LearnerModel;
  onToggleSidebar: () => void;
  onToggleSettings: () => void;
  onOpenSettings: () => void;
  onNewChat: () => void;
  onRenameChat?: () => void;
  onToggleTutor: () => Promise<void>;
  onOpenPlanSheet: () => void;
  onClosePlanSheet: () => void;
  onPlanUpdate: (plan: LearningPlan) => Promise<void>;
  onStartLesson: (nodeId: string) => Promise<void>;
};

export function useTopHeaderState(): TopHeaderState {
  const {
    chat,
    messages,
    renameChat,
    setUI,
    newChat,
    updateChatSettings,
    sendUserMessage,
    collapsed,
    isSettingsOpen,
    planSheetOpen,
    overrides,
    tutorDefaultModelId,
    uiSnapshot,
    experimentalTutor,
    forceTutorMode,
    models,
    planGeneration,
    planSheetOverride,
  } = useChatStore((s) => {
    return {
      chat: selectCurrentChat(s),
      messages: selectMessagesForCurrentChat(s),
      renameChat: s.renameChat,
      setUI: s.setUI,
      newChat: s.newChat,
      updateChatSettings: s.updateChatSettings,
      sendUserMessage: s.sendUserMessage,
      collapsed: s.ui.sidebarCollapsed ?? false,
      isSettingsOpen: s.ui.showSettings,
      planSheetOpen: s.ui.plan.sheetOpen ?? false,
      overrides: s.ui.overrides,
      tutorDefaultModelId: s.ui.tutor.defaultModelId,
      uiSnapshot: s.ui,
      experimentalTutor: !!s.ui.flags.experimentalTutor,
      forceTutorMode: !!s.ui.tutor.forceMode,
      models: s.models,
      planGeneration: s.selectedChatId
        ? s.ui.plan.generationByChatId?.[s.selectedChatId]
        : undefined,
      planSheetOverride: s.ui.plan.sheetPlanOverride ?? null,
    };
  }, shallow);

  const nextOverrides = useMemo(() => overrides ?? EMPTY_OVERRIDES, [overrides]);
  const nextTutorMode = !!nextOverrides.tutorMode;
  const tutorActive = chat
    ? isTutorRuntimeEnabled(uiSnapshot, chat)
    : experimentalTutor && (forceTutorMode || nextTutorMode);
  const tutorModelId =
    chat?.settings?.tutor_default_model || chat?.settings?.model || tutorDefaultModelId;
  const tutorModelMeta = useMemo(() => findModelById(models, tutorModelId), [models, tutorModelId]);
  const tutorModelLabel = useMemo(
    () =>
      tutorModelId ? formatModelLabel({ model: tutorModelMeta, fallbackId: tutorModelId }) : '',
    [tutorModelMeta, tutorModelId],
  );

  const learningPlan = chat?.settings?.learningPlan;
  const hasPlan = !!learningPlan;
  const planProgress = useMemo(
    () => (learningPlan ? calculatePlanProgress(learningPlan) : null),
    [learningPlan],
  );
  const currentNode = useMemo(
    () => (learningPlan ? getNextNode(learningPlan) : null),
    [learningPlan],
  );
  const hasPlanRef = useRef<boolean>(!!learningPlan);

  useEffect(() => {
    if (!learningPlan) {
      hasPlanRef.current = false;
      return;
    }
    if (!hasPlanRef.current && !planSheetOpen) {
      setUI({ plan: { sheetOpen: true, sheetPlanOverride: null } });
    }
    hasPlanRef.current = true;
  }, [learningPlan, planSheetOpen, setUI]);

  const onToggleSidebar = useCallback(() => {
    setUI({ sidebarCollapsed: !collapsed });
  }, [collapsed, setUI]);

  const onToggleSettings = useCallback(() => {
    setUI({ showSettings: !isSettingsOpen });
  }, [isSettingsOpen, setUI]);

  const onOpenSettings = useCallback(() => {
    setUI({ showSettings: true });
  }, [setUI]);

  const onNewChat = useCallback(() => {
    void newChat();
  }, [newChat]);

  const onRenameChat = useCallback(() => {
    if (!chat) return;
    const next = window.prompt('Rename chat', chat.title || 'Untitled chat');
    const trimmed = (next || '').trim();
    if (!trimmed || trimmed === chat.title) return;
    void renameChat(chat.id, trimmed);
  }, [chat, renameChat]);

  const onPlanUpdate = useCallback(
    async (updatedPlan: LearningPlan) => {
      await updateChatSettings({ learningPlan: updatedPlan });
    },
    [updateChatSettings],
  );

  const onStartLesson = useCallback(
    async (nodeId: string) => {
      if (!learningPlan) return;
      const node = learningPlan.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      const isStartingLesson = node.status === 'not_started';

      if (isStartingLesson) {
        const updatedPlan = updateNodeStatus(learningPlan, nodeId, 'in_progress');
        await updateChatSettings({ learningPlan: updatedPlan });
        const prompt = `I am ready to start the topic '${node.name}'. Please introduce this concept and guide me through it.`;
        await sendUserMessage(prompt, {
          metadata: {
            hiddenFromUser: false,
            kind: 'tutor_start_lesson',
          },
        });
      }

      setUI({ plan: { sheetOpen: false, sheetPlanOverride: null } });
    },
    [learningPlan, sendUserMessage, setUI, updateChatSettings],
  );

  const onToggleTutor = useCallback(async () => {
    if (forceTutorMode) return;
    if (chat) {
      if (!chat.settings.tutor_mode) {
        setUI({ overrides: { tutorMode: true } });
        await newChat();
      } else {
        await updateChatSettings({ tutor_mode: false });
      }
    } else {
      setUI({ overrides: { tutorMode: !nextTutorMode } });
    }
  }, [chat, forceTutorMode, newChat, nextTutorMode, setUI, updateChatSettings]);

  const onOpenPlanSheet = useCallback(() => {
    setUI({ plan: { sheetOpen: true, sheetPlanOverride: null } });
  }, [setUI]);

  const onClosePlanSheet = useCallback(() => {
    setUI({ plan: { sheetOpen: false, sheetPlanOverride: null } });
  }, [setUI]);

  const learnerModel = useMemo(
    () => (messages ? getLatestLearnerModel(messages) : undefined),
    [messages],
  );

  return {
    chat,
    collapsed,
    isSettingsOpen,
    planSheetOpen,
    planSheetOverride,
    planGeneration,
    tutorActive,
    tutorModelLabel,
    experimentalTutor,
    forceTutorMode,
    nextTutorMode,
    hasPlan,
    learningPlan,
    planProgress,
    currentNode,
    learnerModel,
    onToggleSidebar,
    onToggleSettings,
    onOpenSettings,
    onNewChat,
    onRenameChat: chat ? onRenameChat : undefined,
    onToggleTutor,
    onOpenPlanSheet,
    onClosePlanSheet,
    onPlanUpdate,
    onStartLesson,
  };
}
