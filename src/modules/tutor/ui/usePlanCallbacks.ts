import { useCallback, useMemo } from 'react';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import {
  calculatePlanProgress,
  getNextNode,
  updateNodeStatus,
} from '@/modules/tutor/learning-plan/service';
import { applyLearnerModelFeedback, resolveLearnerModel } from '@/modules/tutor/learner-model';
import { selectCurrentChat, selectMessagesForCurrentChat } from '@/lib/store/selectors';
import type { LearningPlan, LearnerModel } from '@/lib/types';
import type { LearnerModelFeedback } from '@/modules/tutor/learner-model';
import type { LearnerModelEditCallbacks } from '@/modules/tutor/components/plan/PlanSheet';

type PlanProgress = ReturnType<typeof calculatePlanProgress>;

export type PlanCallbacks = {
  learningPlan?: LearningPlan;
  learnerModel?: LearnerModel;
  hasPlan: boolean;
  planProgress: PlanProgress | null;
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
  onRequestMorePractice: (completedNodeId: string, startedNodeId?: string) => Promise<void>;
  onContestMastery: (nodeId: string, direction: 'up' | 'down') => Promise<number | undefined>;
} & LearnerModelEditCallbacks;

export function usePlanCallbacks(): PlanCallbacks {
  const {
    chat,
    messages,
    setUI,
    updateChatSettings,
    sendUserMessage,
    applyLearnerModelFeedbackFromUser,
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
      rightPanelOpen: s.ui.plan?.rightPanelOpen ?? false,
      rightPanelTab: s.ui.plan?.rightPanelTab ?? 'plan',
    }),
    shallow,
  );

  const learningPlan = chat?.settings?.features.tutor?.learningPlan;
  const hasPlan = !!learningPlan;
  const planProgress = useMemo(
    () => (learningPlan ? calculatePlanProgress(learningPlan) : null),
    [learningPlan],
  );

  const learnerModel = useMemo(
    () => resolveLearnerModel(messages ?? [], chat?.settings?.features.tutor?.learnerModel),
    [chat?.settings?.features.tutor?.learnerModel, messages],
  );

  const onPlanUpdate = useCallback(
    async (updatedPlan: LearningPlan) => {
      await updateChatSettings({ features: { tutor: { learningPlan: updatedPlan } } });
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

  // The learner's answer at a chapter end: "not yet". Reopens the finished
  // topic, puts back the one the tutor had moved on to, and records the
  // learner's own estimate below the advance threshold, as evidence, so the
  // next turn neither re-advances nor forgets it.
  const onRequestMorePractice = useCallback(
    async (completedNodeId: string, startedNodeId?: string) => {
      if (!learningPlan) return;
      const node = learningPlan.nodes.find((n) => n.id === completedNodeId);
      if (!node) return;

      let updatedPlan = updateNodeStatus(learningPlan, completedNodeId, 'in_progress');
      const started = startedNodeId
        ? learningPlan.nodes.find((n) => n.id === startedNodeId)
        : undefined;
      if (started?.status === 'in_progress') {
        updatedPlan = updateNodeStatus(updatedPlan, started.id, 'not_started');
      }

      const current = learnerModel?.mastery?.[completedNodeId]?.confidence;
      const updatedModel = learnerModel
        ? applyLearnerModelFeedback(learnerModel, {
            nodeId: completedNodeId,
            direction: 'down',
            estimatedConfidence: Math.min(current ?? 0.6, 0.6),
            reason: `Learner asked for more practice on "${node.name}" at the end of the topic.`,
          }).model
        : undefined;

      await updateChatSettings({
        features: {
          tutor: {
            learningPlan: updatedPlan,
            ...(updatedModel ? { learnerModel: updatedModel } : {}),
          },
        },
      });
      await sendUserMessage(
        `I'm not ready to move on from "${node.name}" yet. Please give me more practice on it before we continue.`,
        { metadata: { hiddenFromUser: true, kind: 'tutor_more_practice' } },
      );
    },
    [learningPlan, learnerModel, sendUserMessage, updateChatSettings],
  );

  // A margin-note correction: the learner says an estimate is too high or
  // too low. It is saved on the chat as self-reported evidence and reaches
  // the tutor through its next turn's context, so it costs no turn of its
  // own. Returns the new confidence.
  const onContestMastery = useCallback(
    async (nodeId: string, direction: 'up' | 'down') => {
      if (!learnerModel) return undefined;
      const name = learningPlan?.nodes.find((n) => n.id === nodeId)?.name ?? nodeId;
      const { model, to } = applyLearnerModelFeedback(learnerModel, {
        nodeId,
        direction,
        reason: `Learner said the estimate for "${name}" was too ${direction === 'down' ? 'high' : 'low'}.`,
      });
      await updateChatSettings({ features: { tutor: { learnerModel: model } } });
      return to ?? model.mastery[nodeId]?.confidence;
    },
    [learnerModel, learningPlan, updateChatSettings],
  );

  const onToggleRightPanel = useCallback(() => {
    if (rightPanelOpen) {
      setUI({ plan: { rightPanelOpen: false, sheetPlanOverride: null } });
      return;
    }
    setUI({ plan: { rightPanelOpen: true } });
  }, [rightPanelOpen, setUI]);

  const onOpenRightPanel = useCallback(
    (tab?: 'plan' | 'progress') => {
      setUI({
        plan: tab ? { rightPanelOpen: true, rightPanelTab: tab } : { rightPanelOpen: true },
      });
    },
    [setUI],
  );

  const onCloseRightPanel = useCallback(() => {
    setUI({ plan: { rightPanelOpen: false, sheetPlanOverride: null } });
  }, [setUI]);

  const onSendPlanFeedback = useCallback(
    (message: string) => {
      void sendUserMessage(message);
      setUI({ plan: { sheetOpen: false, sheetPlanOverride: null } });
    },
    [sendUserMessage, setUI],
  );

  return {
    learningPlan,
    learnerModel,
    hasPlan,
    planProgress,
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
    onRequestMorePractice,
    onContestMastery,
  };
}
