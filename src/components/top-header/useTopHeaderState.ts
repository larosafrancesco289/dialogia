import { useCallback, useEffect, useMemo, useRef } from 'react';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import { findModelById, formatModelLabel } from '@/lib/models';
import { getNextNode } from '@/lib/learning-plan/service';
import { getBreadcrumbPath, getMilestones } from '@/lib/learning-plan/breadcrumb';
import {
  selectCurrentChat,
  selectIsTutorEnabled,
  selectMessagesForCurrentChat,
  selectNextOverrides,
} from '@/lib/store/selectors';
import { useTier } from '@/lib/auth/tierContext';
import { useTierTutorModelId } from '@/lib/hooks/useTierModels';
import { usePlanCallbacks } from '@/lib/hooks/usePlanCallbacks';
import type { UiPlanSnapshot } from '@/lib/contracts/ui';
import type {
  Chat,
  LearnerModel,
  LearningPlan,
  LearningPlanNode,
  StudyCondition,
} from '@/lib/types';
import type { LearnerModelFeedback } from '@/lib/agent/learner-model';
import type { LearnerModelEditCallbacks } from '@/components/plan/PlanSheet';

type PlanProgress = ReturnType<typeof import('@/lib/learning-plan/service').calculatePlanProgress>;
type PlanNode = ReturnType<typeof getNextNode>;
type PlanGeneration = NonNullable<UiPlanSnapshot['generationByChatId']>[string];

export type Milestone = {
  id: string;
  status: LearningPlanNode['status'];
  name: string;
};

export type TopHeaderState = {
  chat?: Chat;
  collapsed: boolean;
  isSettingsOpen: boolean;
  planSheetOpen: boolean;
  planSheetOverride: LearningPlan | null;
  planGeneration?: PlanGeneration;
  tutorActive: boolean;
  tutorModelId?: string;
  tutorModelLabel: string;
  experimentalTutor: boolean;
  forceTutorMode: boolean;
  nextTutorMode: boolean;
  isStudyTier: boolean;
  studyCondition: StudyCondition;
  hasPlan: boolean;
  learningPlan?: LearningPlan;
  planProgress: PlanProgress | null;
  currentNode: PlanNode;
  learnerModel?: LearnerModel;
  rightPanelOpen: boolean;
  rightPanelTab: 'plan' | 'progress';
  currentTopicName?: string;
  topicProgress: number;
  milestones: Milestone[];
  breadcrumbPath: string[];
  onToggleSidebar: () => void;
  onToggleSettings: () => void;
  onOpenSettings: () => void;
  onNewChat: () => void;
  onRenameChat?: () => void;
  onToggleTutor: () => Promise<void>;
  onOpenPlanSheet: () => void;
  onClosePlanSheet: () => void;
  onToggleRightPanel: () => void;
  onOpenRightPanel: (tab?: 'plan' | 'progress') => void;
  onCloseRightPanel: () => void;
  onPlanUpdate: (plan: LearningPlan) => Promise<void>;
  onStartLesson: (nodeId: string) => Promise<void>;
  onMarkKnown: (nodeId: string) => Promise<void>;
  onLearnerModelFeedback: (feedback: LearnerModelFeedback) => Promise<void>;
  onSendPlanFeedback: (message: string) => void;
} & LearnerModelEditCallbacks;

export function useTopHeaderState(): TopHeaderState {
  const { isStudyTier } = useTier();

  const {
    chat,
    messages,
    renameChat,
    setUI,
    newChat,
    updateChatSettings,
    clearChatMessages,
    collapsed,
    isSettingsOpen,
    planSheetOpen,
    nextOverrides,
    tutorDefaultModelId,
    experimentalTutor,
    forceTutorMode,
    models,
    planGeneration,
    planSheetOverride,
    tutorActive,
  } = useChatStore(
    (s) => ({
      chat: selectCurrentChat(s),
      messages: selectMessagesForCurrentChat(s),
      renameChat: s.renameChat,
      setUI: s.setUI,
      newChat: s.newChat,
      updateChatSettings: s.updateChatSettings,
      clearChatMessages: s.clearChatMessages,
      collapsed: s.ui.sidebarCollapsed ?? false,
      isSettingsOpen: s.ui.showSettings,
      planSheetOpen: s.ui.plan.sheetOpen ?? false,
      nextOverrides: selectNextOverrides(s),
      tutorDefaultModelId: s.ui.tutor.defaultModelId,
      experimentalTutor: !!s.ui.flags.experimentalTutor,
      forceTutorMode: !!s.ui.tutor.forceMode,
      models: s.models,
      planGeneration: s.selectedChatId
        ? s.ui.plan.generationByChatId?.[s.selectedChatId]
        : undefined,
      planSheetOverride: s.ui.plan.sheetPlanOverride ?? null,
      tutorActive: selectIsTutorEnabled(s),
    }),
    shallow,
  );

  const planCallbacks = usePlanCallbacks();

  const nextTutorMode = !!nextOverrides.tutorMode;
  const rawTutorModelId =
    chat?.settings?.features.tutor.defaultModelId || chat?.settings?.modelId || tutorDefaultModelId;
  const tutorModelId = useTierTutorModelId(rawTutorModelId);
  const tutorModelMeta = useMemo(() => findModelById(models, tutorModelId), [models, tutorModelId]);
  const tutorModelLabel = useMemo(
    () =>
      tutorModelId ? formatModelLabel({ model: tutorModelMeta, fallbackId: tutorModelId }) : '',
    [tutorModelMeta, tutorModelId],
  );

  const { learningPlan, planProgress } = planCallbacks;
  const currentNode = useMemo(
    () => (learningPlan ? getNextNode(learningPlan) : null),
    [learningPlan],
  );
  const hasPlanRef = useRef<boolean>(!!learningPlan);

  const currentTopicName = currentNode?.name;
  const topicProgress = planProgress?.percentComplete ?? 0;
  const milestones = useMemo<Milestone[]>(
    () => (learningPlan ? getMilestones(learningPlan) : []),
    [learningPlan],
  );
  const breadcrumbPath = useMemo<string[]>(() => {
    if (learningPlan && currentNode) return getBreadcrumbPath(learningPlan, currentNode.id);
    if (learningPlan) return [learningPlan.goal];
    return [];
  }, [learningPlan, currentNode]);

  // Track whether we've seen a plan
  useEffect(() => {
    if (!learningPlan) {
      hasPlanRef.current = false;
      return;
    }
    hasPlanRef.current = true;
  }, [learningPlan]);

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

  const onToggleTutor = useCallback(async () => {
    if (forceTutorMode) return;

    if (!chat) {
      setUI({ overrides: { tutorMode: !nextTutorMode } });
      return;
    }

    const isTutorChat = chat.settings.features.tutor.enabled;
    const hasUserMessages = messages && messages.some((m) => m.role === 'user');

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
    forceTutorMode,
    messages,
    newChat,
    nextTutorMode,
    setUI,
    updateChatSettings,
  ]);

  const onOpenPlanSheet = useCallback(() => {
    setUI({ plan: { sheetOpen: true, sheetPlanOverride: null } });
  }, [setUI]);

  const onClosePlanSheet = useCallback(() => {
    setUI({ plan: { sheetOpen: false, sheetPlanOverride: null } });
  }, [setUI]);

  return {
    chat,
    collapsed,
    isSettingsOpen,
    planSheetOpen,
    planSheetOverride,
    planGeneration,
    tutorActive,
    tutorModelId,
    tutorModelLabel,
    experimentalTutor,
    forceTutorMode,
    nextTutorMode,
    isStudyTier,
    currentNode,
    currentTopicName,
    topicProgress,
    milestones,
    breadcrumbPath,
    onToggleSidebar,
    onToggleSettings,
    onOpenSettings,
    onNewChat,
    onRenameChat: chat ? onRenameChat : undefined,
    onToggleTutor,
    onOpenPlanSheet,
    onClosePlanSheet,
    ...planCallbacks,
  };
}
