import { useState } from 'react';
import { shallow } from 'zustand/shallow';
import { explainTopic } from '@/modules/tutor/engine';
import {
  useApprovePlan,
  usePlanCallbacks,
  useRequestPlanChanges,
} from '@/modules/tutor/ui/usePlanCallbacks';
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
  const approvePlan = useApprovePlan();
  const requestPlanChanges = useRequestPlanChanges();
  const [approving, setApproving] = useState(false);

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
  // The proposal still waiting can be answered here as on its card. A declined
  // draft cannot; the revision replaces it here when it arrives.
  const pending = isPreviewingProposal ? state.proposal : undefined;
  const answerable = !!pending && pending.plan === planSheetOverride;

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
            mastery={affordances.showMastery ? state.mastery : undefined}
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

      {answerable && (
        <div className="learning-panel__answer">
          <button
            type="button"
            className="btn btn-sm"
            disabled={approving}
            onClick={() => {
              setApproving(true);
              void approvePlan(pending).finally(() => setApproving(false));
            }}
          >
            {approving ? 'Applying…' : 'Approve plan'}
          </button>
          {affordances.revisePlan && (
            <button
              type="button"
              className="btn-outline btn-sm"
              disabled={approving}
              onClick={() => setFeedbackContext({ type: 'plan_proposal' })}
            >
              Suggest changes
            </button>
          )}
        </div>
      )}

      {feedbackContext && (
        <PlanFeedbackModal
          isOpen
          context={feedbackContext}
          // A proposal's draft stays open here for its revision to replace;
          // a request about the standing plan goes back to it.
          onSubmit={(feedback, context) =>
            context.type === 'plan_proposal'
              ? requestPlanChanges(feedback)
              : onRequestPlanChanges(feedback)
          }
          onClose={() => setFeedbackContext(null)}
        />
      )}
    </div>
  );
}
