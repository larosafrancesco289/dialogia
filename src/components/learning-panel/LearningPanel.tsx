'use client';
import { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { shallow } from 'zustand/shallow';
import { usePlanCallbacks } from '@/lib/hooks/usePlanCallbacks';
import { useChatStore } from '@/lib/store';
import { updateNodeStatus } from '@/lib/learning-plan/service';
import { LearningPanelHeader } from './LearningPanelHeader';
import { SummaryStrip } from './SummaryStrip';
import { PlanEditingHint } from '@/components/plan/PlanEditingHint';
import { PlanView } from '@/components/plan/PlanView';
import { MyProgressView } from '@/components/plan/MyProgressView';
import { PlanFeedbackModal, type PlanFeedbackContext } from '@/components/plan/PlanFeedbackModal';
import type { HubTabId } from '@/components/plan/HubTabs';
import { logAction } from '@/lib/study';

export function LearningPanel() {
  const {
    learningPlan,
    learnerModel,
    rightPanelTab,
    onPlanUpdate,
    onStartLesson,
    onMarkKnown,
    onLearnerModelFeedback,
    onConfidenceAdjust,
    onMisconceptionResolve,
    onSetConfidenceFloor,
    onFlagForReview,
    onCloseRightPanel,
    onSendPlanFeedback,
  } = usePlanCallbacks();

  const { setUI, chat, planSheetOverride } = useChatStore(
    (s) => ({
      setUI: s.setUI,
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

  const handleTabChange = useCallback(
    (tab: HubTabId) => {
      setUI({ plan: { rightPanelTab: tab } });
      if (tab === 'progress') logAction('learner_model_viewed');
    },
    [setUI],
  );

  const handleNodeStatusChange = useCallback(
    (nodeId: string, status: 'not_started' | 'in_progress' | 'completed') => {
      if (!plan || isPreviewingProposal) return;
      const updatedPlan = updateNodeStatus(plan, nodeId, status);
      void onPlanUpdate(updatedPlan);
    },
    [isPreviewingProposal, onPlanUpdate, plan],
  );

  const handleSuggestPhaseChange = useCallback((phaseName: string, phaseIndex: number) => {
    setFeedbackContext({ type: 'phase', phaseName, phaseIndex });
  }, []);

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
  const showProgressTab = learnerModelVisible;

  return (
    <div className="learning-panel">
      <LearningPanelHeader
        activeTab={rightPanelTab}
        onTabChange={handleTabChange}
        onCollapse={onCloseRightPanel}
        showProgressTab={showProgressTab}
      />

      <SummaryStrip learnerModel={learnerModel} plan={plan} />

      {planEditable && !isPreviewingProposal && (
        <div className="px-4 pt-2">
          <PlanEditingHint />
        </div>
      )}

      <div className="learning-panel__content">
        <AnimatePresence mode="wait">
          {!showProgressTab || rightPanelTab === 'plan' ? (
            <motion.div
              key="plan"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.12 }}
            >
              <PlanView
                plan={plan}
                readOnly={isReadOnly}
                compact
                {...(!isReadOnly && {
                  onNodeStatusChange: handleNodeStatusChange,
                  onStartLesson,
                  learnerModel,
                  onLearnerModelFeedback,
                  onMarkKnown,
                  onSuggestPhaseChange: handleSuggestPhaseChange,
                })}
              />
            </motion.div>
          ) : (
            <motion.div
              key="progress"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.12 }}
            >
              <MyProgressView
                plan={plan}
                learnerModel={learnerModel}
                compact
                onConfidenceAdjust={onConfidenceAdjust}
                onMisconceptionResolve={onMisconceptionResolve}
                onSetConfidenceFloor={onSetConfidenceFloor}
                onFlagForReview={onFlagForReview}
                onMarkKnown={onMarkKnown}
              />
            </motion.div>
          )}
        </AnimatePresence>
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
