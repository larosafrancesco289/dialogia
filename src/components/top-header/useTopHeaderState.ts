import { useCallback, useEffect, useMemo, useRef } from 'react';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import { findModelById, formatModelLabel } from '@/lib/models';
import { calculatePlanProgress, getNextNode, updateNodeStatus } from '@/lib/learning-plan/service';
import { getBreadcrumbPath, getMilestones } from '@/lib/learning-plan/breadcrumb';
import { getLatestLearnerModel } from '@/lib/agent/learner-model';
import {
  selectCurrentChat,
  selectIsTutorEnabled,
  selectMessagesForCurrentChat,
  selectNextOverrides,
  selectStudyCondition,
} from '@/lib/store/selectors';
import { useTier } from '@/lib/auth/tierContext';
import { useTierTutorModelId } from '@/lib/hooks/useTierModels';
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
import { logAction } from '@/lib/study';

type PlanProgress = ReturnType<typeof calculatePlanProgress>;
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
  // New computed values for tutor status bar
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
    sendUserMessage,
    applyLearnerModelFeedbackFromUser,
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
    studyCondition,
  } = useChatStore((s) => {
    return {
      chat: selectCurrentChat(s),
      messages: selectMessagesForCurrentChat(s),
      renameChat: s.renameChat,
      setUI: s.setUI,
      newChat: s.newChat,
      updateChatSettings: s.updateChatSettings,
      clearChatMessages: s.clearChatMessages,
      sendUserMessage: s.sendUserMessage,
      applyLearnerModelFeedbackFromUser: s.applyLearnerModelFeedbackFromUser,
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
      studyCondition: selectStudyCondition(s),
    };
  }, shallow);

  const nextTutorMode = !!nextOverrides.tutorMode;
  // Resolve tutor model with tier awareness
  const rawTutorModelId =
    chat?.settings?.features.tutor.defaultModelId || chat?.settings?.modelId || tutorDefaultModelId;
  const tutorModelId = useTierTutorModelId(rawTutorModelId);
  const tutorModelMeta = useMemo(() => findModelById(models, tutorModelId), [models, tutorModelId]);
  const tutorModelLabel = useMemo(
    () =>
      tutorModelId ? formatModelLabel({ model: tutorModelMeta, fallbackId: tutorModelId }) : '',
    [tutorModelMeta, tutorModelId],
  );

  const learningPlan = chat?.settings?.features.tutor.learningPlan;
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

  // Computed values for tutor status bar
  const currentTopicName = currentNode?.name;
  const topicProgress = planProgress?.percentComplete ?? 0;
  const milestones = useMemo<Milestone[]>(
    () => (learningPlan ? getMilestones(learningPlan) : []),
    [learningPlan],
  );
  const breadcrumbPath = useMemo<string[]>(
    () =>
      learningPlan && currentNode
        ? getBreadcrumbPath(learningPlan, currentNode.id)
        : learningPlan
          ? [learningPlan.goal]
          : [],
    [learningPlan, currentNode],
  );

  // Track whether we've seen a plan (for potential future use)
  // Note: Auto-open behavior removed - user controls when to view the plan
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

  const onPlanUpdate = useCallback(
    async (updatedPlan: LearningPlan) => {
      await updateChatSettings({ features: { tutor: { learningPlan: updatedPlan } } });
      logAction('plan_edited');
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
        await updateChatSettings({ features: { tutor: { learningPlan: updatedPlan } } });
        const prompt = `I am ready to start the topic '${node.name}'. Please introduce this concept and guide me through it.`;
        await sendUserMessage(prompt, {
          metadata: {
            hiddenFromUser: true,
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

    if (!chat) {
      // No chat exists: toggle the override flag for the next chat
      setUI({ overrides: { tutorMode: !nextTutorMode } });
      return;
    }

    const isTutorChat = chat.settings.features.tutor.enabled;
    const hasUserMessages = messages && messages.some((m) => m.role === 'user');

    if (isTutorChat) {
      if (hasUserMessages) {
        // In tutor chat with user messages: start a new non-tutor chat
        setUI({ overrides: { tutorMode: false } });
        await newChat();
      } else {
        // In tutor chat with only welcome message: disable tutor and clear the welcome message
        clearChatMessages();
        await updateChatSettings({ features: { tutor: { enabled: false } } });
      }
    } else if (hasUserMessages) {
      // In non-tutor chat with messages: ask for confirmation before starting new tutor chat
      const confirmed = window.confirm(
        'Starting a learning session will create a new chat. Continue?',
      );
      if (confirmed) {
        setUI({ overrides: { tutorMode: true } });
        await newChat();
      }
    } else {
      // In empty non-tutor chat: enable tutor in current chat (will trigger welcome message)
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
    logAction('plan_viewed');
  }, [setUI]);

  const onClosePlanSheet = useCallback(() => {
    setUI({ plan: { sheetOpen: false, sheetPlanOverride: null } });
    logAction('plan_closed');
  }, [setUI]);

  const onMarkKnown = useCallback(
    async (nodeId: string) => {
      if (!learningPlan) return;
      const node = learningPlan.nodes.find((n) => n.id === nodeId);
      if (!node) return;

      // Update plan status to completed
      const updatedPlan = updateNodeStatus(learningPlan, nodeId, 'completed');
      await updateChatSettings({ features: { tutor: { learningPlan: updatedPlan } } });

      // Send hidden message to tutor
      await sendUserMessage(
        `I already know the topic "${node.name}". Please skip teaching this and move to the next topic.`,
        { metadata: { hiddenFromUser: true, kind: 'tutor_skip_topic' } },
      );

      setUI({ plan: { sheetOpen: false, sheetPlanOverride: null } });
    },
    [learningPlan, sendUserMessage, setUI, updateChatSettings],
  );

  const onLearnerModelFeedback = useCallback(
    async (feedback: LearnerModelFeedback) => {
      await applyLearnerModelFeedbackFromUser(feedback);
    },
    [applyLearnerModelFeedbackFromUser],
  );

  const onConfidenceAdjust = useCallback(
    (nodeId: string, newConfidence: number, reason?: string) => {
      void onLearnerModelFeedback({
        nodeId,
        estimatedConfidence: newConfidence,
        reason: reason ?? `Adjusted confidence to ${Math.round(newConfidence * 100)}%`,
      });
      logAction('learner_model_edited', { editAction: 'confidence_adjust' });
    },
    [onLearnerModelFeedback],
  );

  const onMisconceptionResolve = useCallback(
    (nodeId: string, misconceptionId: string) => {
      void onLearnerModelFeedback({
        nodeId,
        misconceptionId,
        reason: 'I believe I have resolved this misconception.',
      });
      logAction('learner_model_edited', { editAction: 'misconception_resolve' });
    },
    [onLearnerModelFeedback],
  );

  const onSetConfidenceFloor = useCallback(
    (nodeId: string, floor: number) => {
      void onLearnerModelFeedback({
        nodeId,
        confidenceFloor: floor,
        reason: `Set confidence floor to ${Math.round(floor * 100)}%`,
      });
      logAction('learner_model_edited', { editAction: 'confidence_floor_set' });
    },
    [onLearnerModelFeedback],
  );

  const onFlagForReview = useCallback(
    (nodeId: string) => {
      void onLearnerModelFeedback({
        nodeId,
        direction: 'down',
        reason: 'I flagged this topic for review.',
      });
      logAction('learner_model_edited', { editAction: 'flag_for_review' });
    },
    [onLearnerModelFeedback],
  );

  const onSendPlanFeedback = useCallback(
    (message: string) => {
      void sendUserMessage(message);
      // Close the plan sheet after sending feedback
      setUI({ plan: { sheetOpen: false, sheetPlanOverride: null } });
      logAction('plan_feedback_sent');
    },
    [sendUserMessage, setUI],
  );

  // Get learner model from either chat settings (persisted) or message history
  // Prefer the more recently updated one
  const learnerModel = useMemo(() => {
    const fromSettings = chat?.settings?.features.tutor.learnerModel;
    const fromMessages = messages ? getLatestLearnerModel(messages) : undefined;

    if (!fromSettings && !fromMessages) return undefined;
    if (!fromSettings) return fromMessages;
    if (!fromMessages) return fromSettings;

    // Return the more recently updated one
    return fromSettings.updatedAt > fromMessages.updatedAt ? fromSettings : fromMessages;
  }, [chat?.settings?.features.tutor.learnerModel, messages]);

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
    studyCondition,
    hasPlan,
    learningPlan,
    planProgress,
    currentNode,
    learnerModel,
    // New computed values for tutor status bar
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
    onPlanUpdate,
    onStartLesson,
    onMarkKnown,
    onLearnerModelFeedback,
    onConfidenceAdjust,
    onMisconceptionResolve,
    onSetConfidenceFloor,
    onFlagForReview,
    onSendPlanFeedback,
  };
}
