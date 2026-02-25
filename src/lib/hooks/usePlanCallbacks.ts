import { useCallback, useMemo } from 'react';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import { calculatePlanProgress, getNextNode, updateNodeStatus } from '@/lib/learning-plan/service';
import { getLatestLearnerModel } from '@/lib/agent/learner-model';
import {
  selectCurrentChat,
  selectMessagesForCurrentChat,
  selectStudyCondition,
} from '@/lib/store/selectors';
import type { LearningPlan, LearnerModel, StudyCondition } from '@/lib/types';
import type { LearnerModelFeedback } from '@/lib/agent/learner-model';
import type { LearnerModelEditCallbacks } from '@/components/plan/PlanSheet';
import { logAction } from '@/lib/study';

type PlanProgress = ReturnType<typeof calculatePlanProgress>;

export type PlanCallbacks = {
  learningPlan?: LearningPlan;
  learnerModel?: LearnerModel;
  hasPlan: boolean;
  planProgress: PlanProgress | null;
  studyCondition: StudyCondition;
  rightPanelOpen: boolean;
  rightPanelTab: 'plan' | 'progress';
  onPlanUpdate: (plan: LearningPlan) => Promise<void>;
  onStartLesson: (nodeId: string) => Promise<void>;
  onMarkKnown: (nodeId: string) => Promise<void>;
  onLearnerModelFeedback: (feedback: LearnerModelFeedback) => Promise<void>;
  onToggleRightPanel: () => void;
  onOpenRightPanel: (tab?: 'plan' | 'progress') => void;
  onCloseRightPanel: () => void;
  onSendPlanFeedback: (message: string) => void;
} & LearnerModelEditCallbacks;

export function usePlanCallbacks(): PlanCallbacks {
  const {
    chat,
    messages,
    setUI,
    updateChatSettings,
    sendUserMessage,
    applyLearnerModelFeedbackFromUser,
    studyCondition,
    rightPanelOpen,
    rightPanelTab,
  } = useChatStore(
    (s) => ({
      chat: selectCurrentChat(s),
      messages: selectMessagesForCurrentChat(s),
      setUI: s.setUI,
      updateChatSettings: s.updateChatSettings,
      sendUserMessage: s.sendUserMessage,
      applyLearnerModelFeedbackFromUser: s.applyLearnerModelFeedbackFromUser,
      studyCondition: selectStudyCondition(s),
      rightPanelOpen: s.ui.plan.rightPanelOpen ?? false,
      rightPanelTab: s.ui.plan.rightPanelTab ?? 'plan',
    }),
    shallow,
  );

  const learningPlan = chat?.settings?.features.tutor.learningPlan;
  const hasPlan = !!learningPlan;
  const planProgress = useMemo(
    () => (learningPlan ? calculatePlanProgress(learningPlan) : null),
    [learningPlan],
  );

  const learnerModel = useMemo(() => {
    const fromSettings = chat?.settings?.features.tutor.learnerModel;
    const fromMessages = messages ? getLatestLearnerModel(messages) : undefined;
    if (!fromSettings) return fromMessages;
    if (!fromMessages) return fromSettings;
    return fromSettings.updatedAt >= fromMessages.updatedAt ? fromSettings : fromMessages;
  }, [chat?.settings?.features.tutor.learnerModel, messages]);

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

  const onMarkKnown = useCallback(
    async (nodeId: string) => {
      if (!learningPlan) return;
      const node = learningPlan.nodes.find((n) => n.id === nodeId);
      if (!node) return;

      // 1. Mark topic completed in plan + advance to next topic
      let updatedPlan = updateNodeStatus(learningPlan, nodeId, 'completed');
      const nextNode = getNextNode(updatedPlan);
      if (nextNode && nextNode.status === 'not_started') {
        updatedPlan = updateNodeStatus(updatedPlan, nextNode.id, 'in_progress');
      }
      await updateChatSettings({ features: { tutor: { learningPlan: updatedPlan } } });

      // 2. Set confidence to 70% floor directly
      void applyLearnerModelFeedbackFromUser({
        nodeId,
        estimatedConfidence: 0.7,
        reason: `Student marked "${node.name}" as already known`,
      });

      // 3. Notify tutor (hidden from student)
      await sendUserMessage(
        `I already know the topic "${node.name}". Please skip teaching this and move to the next topic.`,
        { metadata: { hiddenFromUser: true, kind: 'tutor_skip_topic' } },
      );

      logAction('learner_model_edited', { editAction: 'mark_known' });
    },
    [learningPlan, sendUserMessage, updateChatSettings, applyLearnerModelFeedbackFromUser],
  );

  const onLearnerModelFeedback = useCallback(
    (feedback: LearnerModelFeedback) => applyLearnerModelFeedbackFromUser(feedback),
    [applyLearnerModelFeedbackFromUser],
  );

  const onConfidenceAdjust = useCallback(
    (nodeId: string, newConfidence: number, reason?: string) => {
      const feedback = {
        nodeId,
        estimatedConfidence: newConfidence,
        reason: reason ?? `Adjusted confidence to ${Math.round(newConfidence * 100)}%`,
      };
      logAction('learner_model_edited', { editAction: 'confidence_adjust' });
      const pct = Math.round(newConfidence * 100);
      const nodeName = learningPlan?.nodes.find((n) => n.id === nodeId)?.name ?? nodeId;
      void onLearnerModelFeedback(feedback)
        .then(() =>
          sendUserMessage(
            `I adjusted my confidence for "${nodeName}" to ${pct}%. Please acknowledge and adapt your teaching accordingly.`,
            { metadata: { hiddenFromUser: true, kind: 'tutor_confidence_adjust' } },
          ),
        )
        .catch(() => undefined);
    },
    [onLearnerModelFeedback, sendUserMessage, learningPlan],
  );

  const onMisconceptionResolve = useCallback(
    (nodeId: string, misconceptionId: string) => {
      const feedback = {
        nodeId,
        misconceptionId,
        reason: 'I believe I have resolved this misconception.',
      };
      logAction('learner_model_edited', { editAction: 'misconception_resolve' });
      const nodeName = learningPlan?.nodes.find((n) => n.id === nodeId)?.name ?? nodeId;
      void onLearnerModelFeedback(feedback)
        .then(() =>
          sendUserMessage(
            `I marked a misconception as resolved for "${nodeName}". Please acknowledge this update.`,
            { metadata: { hiddenFromUser: true, kind: 'tutor_misconception_resolve' } },
          ),
        )
        .catch(() => undefined);
    },
    [onLearnerModelFeedback, sendUserMessage, learningPlan],
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
      const feedback = {
        nodeId,
        direction: 'down' as const,
        reason: 'I flagged this topic for review.',
      };
      logAction('learner_model_edited', { editAction: 'flag_for_review' });
      const nodeName = learningPlan?.nodes.find((n) => n.id === nodeId)?.name ?? nodeId;
      void onLearnerModelFeedback(feedback)
        .then(() =>
          sendUserMessage(
            `I flagged "${nodeName}" for review — I need more practice on this topic.`,
            { metadata: { hiddenFromUser: true, kind: 'tutor_flag_for_review' } },
          ),
        )
        .catch(() => undefined);
    },
    [onLearnerModelFeedback, sendUserMessage, learningPlan],
  );

  const onToggleRightPanel = useCallback(() => {
    if (rightPanelOpen) {
      setUI({ plan: { rightPanelOpen: false, sheetPlanOverride: null } });
      logAction('plan_closed', {
        source: 'plan_status_badge',
        tab: rightPanelTab,
        manual: true,
      });
      return;
    }
    setUI({ plan: { rightPanelOpen: true } });
    logAction('plan_viewed', {
      source: 'plan_status_badge',
      tab: rightPanelTab,
      manual: true,
    });
  }, [rightPanelOpen, rightPanelTab, setUI]);

  const onOpenRightPanel = useCallback(
    (tab?: 'plan' | 'progress') => {
      const nextTab = tab ?? rightPanelTab;
      if (nextTab !== rightPanelTab) {
        logAction('plan_tab_changed', {
          from: rightPanelTab,
          to: nextTab,
          source: 'learning_hub_open',
        });
      }
      setUI({
        plan: tab ? { rightPanelOpen: true, rightPanelTab: tab } : { rightPanelOpen: true },
      });
      logAction(tab === 'progress' ? 'learner_model_viewed' : 'plan_viewed', {
        source: 'learning_hub_open',
        tab: tab ?? 'plan',
        manual: true,
      });
    },
    [rightPanelTab, setUI],
  );

  const onCloseRightPanel = useCallback(() => {
    setUI({ plan: { rightPanelOpen: false, sheetPlanOverride: null } });
    logAction('plan_closed', {
      source: 'learning_hub_close',
      tab: rightPanelTab,
      manual: true,
    });
  }, [rightPanelTab, setUI]);

  const onSendPlanFeedback = useCallback(
    (message: string) => {
      void sendUserMessage(message);
      setUI({ plan: { sheetOpen: false, sheetPlanOverride: null } });
      logAction('plan_feedback_sent');
    },
    [sendUserMessage, setUI],
  );

  return {
    learningPlan,
    learnerModel,
    hasPlan,
    planProgress,
    studyCondition,
    rightPanelOpen,
    rightPanelTab,
    onPlanUpdate,
    onStartLesson,
    onMarkKnown,
    onLearnerModelFeedback,
    onConfidenceAdjust,
    onMisconceptionResolve,
    onSetConfidenceFloor,
    onFlagForReview,
    onToggleRightPanel,
    onOpenRightPanel,
    onCloseRightPanel,
    onSendPlanFeedback,
  };
}
