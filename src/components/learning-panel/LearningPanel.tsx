'use client';
import { useCallback, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { usePlanCallbacks } from '@/lib/hooks/usePlanCallbacks';
import { useChatStore } from '@/lib/store';
import { updateNodeStatus } from '@/lib/learning-plan/service';
import { LearningPanelHeader } from './LearningPanelHeader';
import { SummaryStrip } from './SummaryStrip';
import { PlanEditingHint } from '@/components/plan/PlanEditingHint';
import { PlanView } from '@/components/plan/PlanView';
import { PlanFeedbackModal, type PlanFeedbackContext } from '@/components/plan/PlanFeedbackModal';

export function LearningPanel() {
  const {
    learningPlan,
    learnerModel,
    onPlanUpdate,
    onStartLesson,
    onMarkKnown,
    onConfidenceAdjust,
    onMisconceptionResolve,
    onFlagForReview,
    onSendPlanFeedback,
  } = usePlanCallbacks();

  const { chat, planSheetOverride } = useChatStore(
    (s) => ({
      chat: s.chats.find((c) => c.id === s.selectedChatId),
      planSheetOverride: s.ui.plan.sheetPlanOverride ?? null,
    }),
    shallow,
  );

  const tutorFlags = chat?.settings?.features.tutor;
  const planEditable = tutorFlags?.planEditable !== false;
  const learnerModelVisible = tutorFlags?.learnerModelVisible !== false;

  const [feedbackContext, setFeedbackContext] = useState<PlanFeedbackContext | null>(null);
  const plan = planSheetOverride ?? learningPlan;
  const isPreviewingProposal = !!planSheetOverride && !learningPlan;

  const handleNodeStatusChange = useCallback(
    (nodeId: string, status: 'not_started' | 'in_progress' | 'completed') => {
      if (!plan || isPreviewingProposal) return;
      const updatedPlan = updateNodeStatus(plan, nodeId, status);
      void onPlanUpdate(updatedPlan);
    },
    [isPreviewingProposal, onPlanUpdate, plan],
  );

  const handleFeedbackSubmit = useCallback(
    (feedback: string, context: PlanFeedbackContext) => {
      const prefix =
        context.type === 'phase' ? `Plan feedback for ${context.phaseName}:\n` : 'Plan feedback:\n';
      onSendPlanFeedback(`${prefix}${feedback}\nPlease update the plan and confirm the changes.`);
    },
    [onSendPlanFeedback],
  );

  if (!plan) return null;

  const isReadOnly = !planEditable || isPreviewingProposal;

  return (
    <div className="learning-panel">
      <LearningPanelHeader />

      <SummaryStrip
        learnerModel={learnerModel}
        plan={plan}
        learnerModelVisible={learnerModelVisible}
      />

      {planEditable && !isPreviewingProposal && <PlanEditingHint />}

      <div className="learning-panel__content">
        <PlanView
          plan={plan}
          readOnly={isReadOnly}
          learnerModel={learnerModel}
          learnerModelVisible={learnerModelVisible}
          onNodeStatusChange={isReadOnly ? undefined : handleNodeStatusChange}
          onStartLesson={isReadOnly ? undefined : onStartLesson}
          onMarkKnown={isReadOnly ? undefined : onMarkKnown}
          onConfidenceAdjust={isReadOnly ? undefined : onConfidenceAdjust}
          onMisconceptionResolve={isReadOnly ? undefined : onMisconceptionResolve}
          onFlagForReview={isReadOnly ? undefined : onFlagForReview}
        />
      </div>

      {/* Bottom agency bar */}
      {learnerModelVisible && (
        <div className="learning-panel__bottom-bar">
          <button
            className="plan-bottom-btn plan-bottom-btn--pri"
            onClick={() => setFeedbackContext({ type: 'general' })}
          >
            Suggest plan changes
          </button>
        </div>
      )}

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
