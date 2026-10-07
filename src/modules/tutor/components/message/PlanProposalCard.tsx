import { useRef, useState } from 'react';
import { useChatStore } from '@/lib/store';
import { PlanFeedbackModal } from '@/modules/tutor/components/plan/PlanFeedbackModal';
import type { ProposalView } from '@/modules/tutor/ui/messageViews';
import { useApprovePlan, useRequestPlanChanges } from '@/modules/tutor/ui/usePlanCallbacks';
import { useTutorAffordances } from '@/modules/tutor/ui/useTutorFlags';
import { Markdown } from '@/components/Markdown';
import { useT } from '@/modules/tutor/i18n';

export function PlanProposalCard({
  messageId,
  proposal,
}: {
  messageId: string;
  proposal: ProposalView;
}) {
  const t = useT();
  const [approving, setApproving] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const setUI = useChatStore((s) => s.setUI);
  const approvePlan = useApprovePlan();
  const requestPlanChanges = useRequestPlanChanges();
  // A second click lands before the disabled state renders; without this it
  // would find the proposal already approved and report a failure.
  const acting = useRef(false);
  // Declining is negotiating the plan; a read-only plan only takes approval.
  const { revisePlan } = useTutorAffordances();

  // Once answered, the card is a record: its choices go, and only what became of it stays.
  const resolved = proposal.status !== 'pending';
  const disableActions = approving || declining;
  const estimatedHours = proposal.plan.metadata?.estimatedHours;

  // An approved proposal is the plan the Hub already shows; one still open is
  // previewed there, read-only. A replaced one is not offered: the revision
  // below is the plan to read.
  const handleOpenFullPlan = () => {
    setUI({
      plan: {
        rightPanelOpen: true,
        rightPanelTab: 'plan',
        sheetPlanOverride: proposal.status === 'approved' ? null : proposal.plan,
      },
    });
  };

  const handleApprove = async () => {
    if (acting.current) return;
    acting.current = true;
    setApproving(true);
    try {
      await approvePlan({ proposalId: proposal.proposalId, messageId });
    } finally {
      acting.current = false;
      setApproving(false);
    }
  };

  const handleRequestChanges = () => {
    if (declining || approving) return;
    setFeedbackModalOpen(true);
  };

  const handleFeedbackSubmit = async (feedback: string) => {
    if (acting.current) return;
    acting.current = true;
    setDeclining(true);
    try {
      await requestPlanChanges(feedback, { proposalId: proposal.proposalId, messageId });
    } finally {
      acting.current = false;
      setDeclining(false);
    }
  };

  // Settled for good once answered: a revision that arrives later is "below".
  const resolvedLabel =
    proposal.status === 'approved'
      ? t('plan.approved')
      : proposal.status === 'declined'
        ? t('plan.changesRequested')
        : proposal.status === 'replaced'
          ? t('plan.revisedBelow')
          : null;

  return (
    <>
      <div className="exercise">
        {/* The sheet's head names the card; the card starts with the goal. */}
        <div>
          <p className="exercise__question">
            <Markdown inline content={proposal.plan.goal} />
          </p>
          <ol className="exercise__topics">
            {proposal.plan.nodes.map((node) => (
              <li key={node.id}>
                <Markdown inline content={node.name} />
              </li>
            ))}
          </ol>
          {estimatedHours ? (
            <p className="exercise__meta">{t('plan.hours', { count: estimatedHours })}</p>
          ) : null}
        </div>
        {!resolved && proposal.rationale && (
          <p className="exercise__aside">
            <Markdown inline content={proposal.rationale} />
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {!resolved && (
            <button className="btn btn-sm" onClick={handleApprove} disabled={disableActions}>
              {t(approving ? 'plan.applying' : 'plan.approve')}
            </button>
          )}
          {!resolved && revisePlan && (
            <button
              className="btn-outline btn-sm"
              onClick={handleRequestChanges}
              disabled={disableActions}
            >
              {t(declining ? 'plan.recording' : 'plan.suggest')}
            </button>
          )}
          {proposal.status !== 'replaced' && (
            <button className="btn-ghost btn-sm" onClick={handleOpenFullPlan}>
              {t('plan.viewFull')}
            </button>
          )}
          {resolvedLabel && <span className="exercise__kicker ml-auto">{resolvedLabel}</span>}
        </div>
      </div>

      <PlanFeedbackModal
        isOpen={feedbackModalOpen && revisePlan}
        context={{ type: 'plan_proposal' }}
        onSubmit={handleFeedbackSubmit}
        onClose={() => setFeedbackModalOpen(false)}
      />
    </>
  );
}
