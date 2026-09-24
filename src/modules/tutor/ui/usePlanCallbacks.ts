import { useCallback, useMemo } from 'react';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import type { LearningPlan, TopicMastery } from '@/lib/types';
import { confidenceOf, type LearnerCommand, type TutorState } from '@/modules/tutor/engine';
import type { TutorDispatchResult } from '@/modules/tutor/store/tutorSlice';
import { useTutorSession } from '@/modules/tutor/ui/useTutorSession';

type PlanProgress = { completed: number; total: number; percentComplete: number };

/** Distributes Omit over the command union, so a command is written without its actor. */
type WithoutBy<T> = T extends unknown ? Omit<T, 'by'> : never;
export type LearnerAction = WithoutBy<LearnerCommand>;

// B2: "Too high / Too low" moves the estimate by this much; the Hub redesign
// replaces it with a direct setting.
const CONTEST_STEP = 0.15;

export type PlanCallbacks = {
  state: TutorState;
  learningPlan?: LearningPlan;
  mastery: Record<string, TopicMastery>;
  hasPlan: boolean;
  planProgress: PlanProgress | null;
  rightPanelOpen: boolean;
  rightPanelTab: 'plan' | 'progress';
  /** Runs a learner command through the engine; undefined when no chat is selected. */
  dispatch: (
    command: LearnerAction,
    messageId?: string,
  ) => Promise<TutorDispatchResult | undefined>;
  onStartLesson: (nodeId: string) => Promise<void>;
  onMarkKnown: (nodeId: string) => Promise<void>;
  onToggleRightPanel: () => void;
  onOpenRightPanel: (tab?: 'plan' | 'progress') => void;
  onCloseRightPanel: () => void;
  onSendPlanFeedback: (message: string) => void;
  onRequestMorePractice: (nodeId: string) => Promise<void>;
  onContestMastery: (nodeId: string, direction: 'up' | 'down') => Promise<number | undefined>;
  onResolveMisconceptionQuietly: (nodeId: string, misconceptionId: string) => Promise<void>;
  onReopenTopic: (nodeId: string) => Promise<void>;
};

/**
 * The plan and learner model as the Hub, the header and the chapter breaks
 * read them, and the learner's controls over them. Every change is a learner
 * command through `dispatchTutor`. Quiet corrections only dispatch (the next
 * turn's state block reports them); the ones that call for the tutor's reply
 * also send a short message saying what the learner did.
 */
export function usePlanCallbacks(): PlanCallbacks {
  const { chatId, session } = useTutorSession();
  const { setUI, sendUserMessage, dispatchTutor, rightPanelOpen, rightPanelTab } = useChatStore(
    (s) => ({
      setUI: s.setUI,
      sendUserMessage: s.sendUserMessage,
      dispatchTutor: s.dispatchTutor,
      rightPanelOpen: s.ui.plan?.rightPanelOpen ?? false,
      rightPanelTab: s.ui.plan?.rightPanelTab ?? 'plan',
    }),
    shallow,
  );

  const state = session.state;
  const learningPlan = state.plan;
  const planProgress = useMemo((): PlanProgress | null => {
    if (!learningPlan) return null;
    const total = learningPlan.nodes.length;
    const completed = learningPlan.nodes.filter((n) => n.status === 'completed').length;
    return { completed, total, percentComplete: total ? Math.round((completed / total) * 100) : 0 };
  }, [learningPlan]);

  const dispatch = useCallback(
    async (command: LearnerAction, messageId?: string) => {
      if (!chatId) return undefined;
      return dispatchTutor(chatId, { ...command, by: 'learner' } as LearnerCommand, {
        by: 'learner',
        ...(messageId ? { messageId } : {}),
      });
    },
    [chatId, dispatchTutor],
  );

  const nameOf = useCallback(
    (nodeId: string) => learningPlan?.nodes.find((n) => n.id === nodeId)?.name ?? nodeId,
    [learningPlan],
  );

  // B2: these become visible ledger lines; until then they are hidden user messages.
  const tellTutor = useCallback(
    (content: string, kind: string) =>
      sendUserMessage(content, { metadata: { hiddenFromUser: true, kind } }),
    [sendUserMessage],
  );

  const onStartLesson = useCallback(
    async (nodeId: string) => {
      const result = await dispatch({ type: 'start_topic', nodeId });
      setUI({ plan: { sheetOpen: false, sheetPlanOverride: null } });
      if (result?.ok) await tellTutor(`Started ${nameOf(nodeId)}.`, 'tutor_start_lesson');
    },
    [dispatch, nameOf, setUI, tellTutor],
  );

  const onMarkKnown = useCallback(
    async (nodeId: string) => {
      await dispatch({ type: 'mark_known', nodeId });
    },
    [dispatch],
  );

  const onRequestMorePractice = useCallback(
    async (nodeId: string) => {
      const result = await dispatch({ type: 'more_practice', nodeId });
      if (result?.ok) {
        await tellTutor(`Asked for more practice on ${nameOf(nodeId)}.`, 'tutor_more_practice');
      }
    },
    [dispatch, nameOf, tellTutor],
  );

  const onContestMastery = useCallback(
    async (nodeId: string, direction: 'up' | 'down') => {
      const current = confidenceOf(state, nodeId);
      const setTo =
        Math.round(
          Math.min(1, Math.max(0, current + (direction === 'up' ? CONTEST_STEP : -CONTEST_STEP))) *
            100,
        ) / 100;
      const result = await dispatch({
        type: 'adjust_mastery',
        nodeId,
        setTo,
        note: `You said the estimate was too ${direction === 'down' ? 'high' : 'low'}.`,
      });
      return result?.ok ? confidenceOf(result.state, nodeId) : undefined;
    },
    [dispatch, state],
  );

  const onResolveMisconceptionQuietly = useCallback(
    async (nodeId: string, misconceptionId: string) => {
      await dispatch({ type: 'resolve_misconception', nodeId, misconceptionId });
    },
    [dispatch],
  );

  const onReopenTopic = useCallback(
    async (nodeId: string) => {
      const result = await dispatch({ type: 'reopen_topic', nodeId });
      if (result?.ok) await tellTutor(`Reopened ${nameOf(nodeId)}.`, 'tutor_reopen_topic');
    },
    [dispatch, nameOf, tellTutor],
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
    state,
    learningPlan,
    mastery: state.mastery,
    hasPlan: !!learningPlan,
    planProgress,
    rightPanelOpen,
    rightPanelTab,
    dispatch,
    onStartLesson,
    onMarkKnown,
    onToggleRightPanel,
    onOpenRightPanel,
    onCloseRightPanel,
    onSendPlanFeedback,
    onRequestMorePractice,
    onContestMastery,
    onResolveMisconceptionQuietly,
    onReopenTopic,
  };
}
