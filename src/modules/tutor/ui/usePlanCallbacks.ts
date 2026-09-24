import { useCallback, useMemo } from 'react';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import type { LearningPlan, TopicMastery } from '@/lib/types';
import {
  confidenceOf,
  contestTarget,
  type LearnerCommand,
  type TutorState,
} from '@/modules/tutor/engine';
import type { TutorDispatchResult } from '@/modules/tutor/store/tutorSlice';
import { LEDGER } from '@/modules/tutor/lib/ledger';
import { useLedger } from '@/modules/tutor/ui/ledger';
import { useTutorSession } from '@/modules/tutor/ui/useTutorSession';

type PlanProgress = { completed: number; total: number; percentComplete: number };

/** Distributes Omit over the command union, so a command is written without its actor. */
type WithoutBy<T> = T extends unknown ? Omit<T, 'by'> : never;
export type LearnerAction = WithoutBy<LearnerCommand>;

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
  /** The chapter break's "Go on". */
  onGoOn: (nodeId: string) => Promise<void>;
  /** Revise's "Do this next". */
  onStartNext: (nodeId: string) => Promise<void>;
  /** Revise's "I know this". */
  onMarkKnown: (nodeId: string) => Promise<void>;
  onReopenTopic: (nodeId: string) => Promise<void>;
  onRequestMorePractice: (nodeId: string) => Promise<void>;
  onContestMastery: (nodeId: string, direction: 'up' | 'down') => Promise<number | undefined>;
  onResolveMisconceptionQuietly: (nodeId: string, misconceptionId: string) => Promise<void>;
  onToggleRightPanel: () => void;
  onOpenRightPanel: (tab?: 'plan' | 'progress') => void;
  onCloseRightPanel: () => void;
  onSendPlanFeedback: (message: string) => void;
};

/**
 * The plan and learner model as the Hub, the header and the chapter breaks
 * read them, and the learner's controls over them. Every change is a learner
 * command through `dispatchTutor`. Quiet corrections only dispatch (the next
 * turn's state block reports them); the ones that call for the tutor's reply
 * then leave a ledger line in the transcript, which starts its turn.
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
  const ledger = useLedger();

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

  /** Dispatches, then (only if the engine took it) leaves the ledger line. */
  const act = useCallback(
    async (command: LearnerAction & { nodeId: string }, line: (topic: string) => string) => {
      const result = await dispatch(command);
      if (result?.ok) await ledger(line(nameOf(command.nodeId)));
    },
    [dispatch, ledger, nameOf],
  );

  const onGoOn = useCallback(
    (nodeId: string) => act({ type: 'start_topic', nodeId }, LEDGER.goingOn),
    [act],
  );

  const onStartNext = useCallback(
    async (nodeId: string) => {
      setUI({ plan: { sheetOpen: false, sheetPlanOverride: null } });
      await act({ type: 'start_topic', nodeId }, LEDGER.startedTopic);
    },
    [act, setUI],
  );

  const onMarkKnown = useCallback(
    (nodeId: string) => act({ type: 'mark_known', nodeId }, LEDGER.markedKnown),
    [act],
  );

  const onReopenTopic = useCallback(
    (nodeId: string) => act({ type: 'reopen_topic', nodeId }, LEDGER.reopenedTopic),
    [act],
  );

  const onRequestMorePractice = useCallback(
    (nodeId: string) => act({ type: 'more_practice', nodeId }, LEDGER.morePractice),
    [act],
  );

  const onContestMastery = useCallback(
    async (nodeId: string, direction: 'up' | 'down') => {
      // From the store at click time, not this render's state: a second click
      // before the re-render must step from where the first one left it.
      const latest = chatId ? useChatStore.getState().tutorSessions[chatId]?.state : undefined;
      const result = await dispatch({
        type: 'adjust_mastery',
        nodeId,
        setTo: contestTarget(confidenceOf(latest ?? state, nodeId), direction),
        note: `You said the estimate was too ${direction === 'down' ? 'high' : 'low'}.`,
      });
      return result?.ok ? confidenceOf(result.state, nodeId) : undefined;
    },
    [chatId, dispatch, state],
  );

  const onResolveMisconceptionQuietly = useCallback(
    async (nodeId: string, misconceptionId: string) => {
      await dispatch({ type: 'resolve_misconception', nodeId, misconceptionId });
    },
    [dispatch],
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
    onGoOn,
    onStartNext,
    onMarkKnown,
    onReopenTopic,
    onRequestMorePractice,
    onContestMastery,
    onResolveMisconceptionQuietly,
    onToggleRightPanel,
    onOpenRightPanel,
    onCloseRightPanel,
    onSendPlanFeedback,
  };
}
