import { useCallback, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { explainTopic } from '@/modules/tutor/engine';
import { usePlanCallbacks } from '@/modules/tutor/ui/usePlanCallbacks';
import { useTutorAffordances } from '@/modules/tutor/ui/useTutorFlags';
import { useChatStore } from '@/lib/store';
import { LearningPanelHeader } from './LearningPanelHeader';
import { ContentsView } from './ContentsView';
import { ReviseView } from './ReviseView';
import {
  PlanFeedbackModal,
  type PlanFeedbackContext,
} from '@/modules/tutor/components/plan/PlanFeedbackModal';

/**
 * The Learning Hub. At rest it is the contents: the plan to read and the
 * learner model to read and, where allowed, correct in place. Revise plan
 * switches to the plan's own negotiation. Each part appears only under the
 * study flags that allow it.
 */
export function LearningPanel() {
  const {
    learningPlan,
    state,
    onStartNext,
    onMarkKnown,
    onReopenTopic,
    onContestMastery,
    onResolveMisconceptionQuietly,
    onSendPlanFeedback,
    onCloseRightPanel,
  } = usePlanCallbacks();
  const affordances = useTutorAffordances();

  const { planSheetOverride, revisingState, setUI } = useChatStore(
    (s) => ({
      planSheetOverride: s.ui.plan?.sheetPlanOverride ?? null,
      revisingState: s.ui.plan?.revising ?? false,
      setUI: s.setUI,
    }),
    shallow,
  );

  const [feedbackContext, setFeedbackContext] = useState<PlanFeedbackContext | null>(null);
  const plan = planSheetOverride ?? learningPlan;
  // A proposal is previewed, not lived in: nothing on it can be changed yet.
  const isPreviewingProposal = !!planSheetOverride && !learningPlan;

  const handleFeedbackSubmit = useCallback(
    (feedback: string, context: PlanFeedbackContext) => {
      const prefix =
        context.type === 'phase' ? `Plan feedback for ${context.phaseName}:\n` : 'Plan feedback:\n';
      onSendPlanFeedback(`${prefix}${feedback}\nPlease update the plan and confirm the changes.`);
    },
    [onSendPlanFeedback],
  );

  if (!plan) return null;

  const canRevise = affordances.revisePlan && !isPreviewingProposal;
  const revising = canRevise && revisingState;
  const setRevising = (next: boolean) => setUI({ plan: { revising: next } });

  return (
    <div className="learning-panel">
      <LearningPanelHeader
        revising={revising}
        canRevise={canRevise}
        onToggleRevise={() => setRevising(!revising)}
        onClose={onCloseRightPanel}
      />
      <div className="learning-panel__content">
        {revising ? (
          <ReviseView
            plan={plan}
            revisions={{
              onSkip: onMarkKnown,
              onStartNext,
              onReopen: onReopenTopic,
              onDiscuss: () => setFeedbackContext({ type: 'general' }),
            }}
          />
        ) : (
          <ContentsView
            plan={plan}
            mastery={state.mastery}
            explain={(nodeId) => explainTopic(state, nodeId)}
            affordances={
              isPreviewingProposal ? { ...affordances, correctMastery: false } : affordances
            }
            corrections={{
              onContestMastery,
              onResolveMisconception: onResolveMisconceptionQuietly,
            }}
          />
        )}
      </div>

      {feedbackContext && (
        <PlanFeedbackModal
          isOpen
          context={feedbackContext}
          onSubmit={handleFeedbackSubmit}
          onClose={() => setFeedbackContext(null)}
        />
      )}
    </div>
  );
}
