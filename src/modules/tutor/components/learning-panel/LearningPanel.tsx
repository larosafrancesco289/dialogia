import { useState } from 'react';
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
 * learner model to read and, where allowed, correct in place. Edit plan
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
    onClearMisconception,
    onRequestPlanChanges,
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
  // The override is only ever a proposal, previewed rather than lived in:
  // nothing on it can be changed, even beside a plan that already stands.
  const isPreviewingProposal = !!planSheetOverride;

  if (!plan) return null;

  const canRevise = affordances.revisePlan && !isPreviewingProposal;
  const revising = canRevise && revisingState;
  const setRevising = (next: boolean) => setUI({ plan: { revising: next } });

  return (
    <div className="learning-panel">
      <LearningPanelHeader
        revising={revising}
        previewing={isPreviewingProposal}
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
              onResolveMisconception: onClearMisconception,
            }}
          />
        )}
      </div>

      {feedbackContext && (
        <PlanFeedbackModal
          isOpen
          context={feedbackContext}
          onSubmit={(feedback) => onRequestPlanChanges(feedback)}
          onClose={() => setFeedbackContext(null)}
        />
      )}
    </div>
  );
}
