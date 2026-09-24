import { useState } from 'react';
import { useChatStore } from '@/lib/store';
import { NOTICE_PLAN_APPLY_FAILED } from '@/lib/store/notices';
import { PlanFeedbackModal } from '@/modules/tutor/components/plan/PlanFeedbackModal';
import type { ProposalView } from '@/modules/tutor/ui/messageViews';

export function PlanProposalCard({
  chatId,
  messageId,
  proposal,
}: {
  chatId: string;
  messageId: string;
  proposal: ProposalView;
}) {
  const [approving, setApproving] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const dispatchTutor = useChatStore((s) => s.dispatchTutor);
  const setUI = useChatStore((s) => s.setUI);
  const setNotice = useChatStore((s) => s.setNotice);
  const sendUserMessage = useChatStore((s) => s.sendUserMessage);

  const resolved = proposal.status !== 'pending';
  const disableActions = resolved || approving || declining;
  const nodesCount = proposal.plan.nodes.length;
  const estimatedHours = proposal.plan.metadata?.estimatedHours;

  const handleOpenFullPlan = () => {
    setUI({
      plan: { rightPanelOpen: true, rightPanelTab: 'plan', sheetPlanOverride: proposal.plan },
    });
  };

  const handleApprove = async () => {
    setApproving(true);
    try {
      const result = await dispatchTutor(
        chatId,
        { by: 'learner', type: 'approve_plan', proposalId: proposal.proposalId },
        { by: 'learner', messageId },
      );
      if (!result.ok) {
        setNotice(NOTICE_PLAN_APPLY_FAILED);
        return;
      }
      setUI({
        plan: {
          rightPanelOpen: true,
          rightPanelTab: 'plan',
          sheetPlanOverride: null,
          sheetOpen: false,
        },
      });
      // B2: a visible ledger line instead of a hidden message.
      await sendUserMessage('Approved the plan.', {
        metadata: { hiddenFromUser: true, kind: 'tutor_plan_adoption' },
      });
    } catch {
      setNotice(NOTICE_PLAN_APPLY_FAILED);
    } finally {
      setApproving(false);
    }
  };

  const handleRequestChanges = () => {
    if (declining || approving) return;
    setFeedbackModalOpen(true);
  };

  const handleFeedbackSubmit = async (feedback: string) => {
    setDeclining(true);
    try {
      const result = await dispatchTutor(
        chatId,
        { by: 'learner', type: 'decline_plan', proposalId: proposal.proposalId, feedback },
        { by: 'learner', messageId },
      );
      if (!result.ok) return;
      await sendUserMessage(`Declined the plan: ${feedback}`);
    } finally {
      setDeclining(false);
    }
  };

  const resolvedLabel =
    proposal.status === 'approved'
      ? 'Plan adopted'
      : proposal.status === 'declined'
        ? 'Awaiting revisions'
        : proposal.status === 'replaced'
          ? 'Replaced'
          : null;

  return (
    <>
      <div className="exercise">
        <div>
          <h4 className="exercise__title">Your learning plan is ready</h4>
          <p className="exercise__meta">
            {nodesCount} topics{estimatedHours ? ` · about ${estimatedHours} hours` : ''}
          </p>
        </div>
        <p className="exercise__question">{proposal.plan.goal}</p>
        {!resolved && proposal.rationale && <p className="exercise__aside">{proposal.rationale}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-sm" onClick={handleApprove} disabled={disableActions}>
            {approving ? 'Applying…' : 'Approve plan'}
          </button>
          <button
            className="btn-outline btn-sm"
            onClick={handleRequestChanges}
            disabled={disableActions}
          >
            {declining ? 'Recording…' : 'Suggest changes'}
          </button>
          <button className="btn-ghost btn-sm" onClick={handleOpenFullPlan}>
            View full plan
          </button>
          {resolvedLabel && <span className="exercise__kicker ml-auto">{resolvedLabel}</span>}
        </div>
      </div>

      <PlanFeedbackModal
        isOpen={feedbackModalOpen}
        context={{ type: 'plan_proposal' }}
        onSubmit={handleFeedbackSubmit}
        onClose={() => setFeedbackModalOpen(false)}
      />
    </>
  );
}
