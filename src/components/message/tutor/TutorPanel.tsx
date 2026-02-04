'use client';
import { motion, MotionConfig, useReducedMotion } from 'framer-motion';
import { AcademicCapIcon } from '@heroicons/react/24/outline';
import { useChatStore } from '@/lib/store';
import { selectStudyCondition } from '@/lib/store/selectors';
import type {
  TutorDiagnostic,
  TutorFillBlankItem,
  TutorLearnerModelUpdate,
  TutorMCQItem,
  TutorOpenItem,
  TutorPlanProposal,
  TutorPlanSuggestion,
  TutorQuestionnaire,
} from '@/lib/types';
import { cardVariants } from '@/components/message/tutor/shared';
import { QuestionnaireCard } from '@/components/message/tutor/QuestionnaireCard';
import { PlanProposalCard } from '@/components/message/tutor/PlanProposalCard';
import { PlanSuggestionsCard } from '@/components/message/tutor/PlanSuggestionsCard';
import { DiagnosticCard } from '@/components/message/tutor/DiagnosticCard';
import { McqCard } from '@/components/message/tutor/McqCard';
import { FillBlankCard } from '@/components/message/tutor/FillBlankCard';
import { OpenEndedCard } from '@/components/message/tutor/OpenEndedCard';
import { LearnerUpdatesCard } from '@/components/message/tutor/LearnerUpdatesCard';
import { GradingFeedbackCard } from '@/components/message/tutor/GradingFeedbackCard';

export function TutorPanel(props: {
  messageId: string;
  title?: string;
  mcq?: TutorMCQItem[];
  fillBlank?: TutorFillBlankItem[];
  openEnded?: TutorOpenItem[];
  questionnaire?: TutorQuestionnaire;
  diagnostic?: TutorDiagnostic;
  planProposal?: TutorPlanProposal;
  planSuggestions?: TutorPlanSuggestion[];
  assessmentUpdates?: TutorLearnerModelUpdate[];
  grading?: Record<string, { score?: number; feedback: string; criteria?: string[] }>;
  isLatestAssistant?: boolean;
}) {
  const studyCondition = useChatStore(selectStudyCondition);
  const reduceMotion = useReducedMotion();

  const {
    messageId,
    title,
    mcq,
    fillBlank,
    openEnded,
    questionnaire,
    diagnostic,
    planProposal,
    planSuggestions,
    assessmentUpdates,
    grading,
    isLatestAssistant,
  } = props;

  const canShowUpdates = studyCondition !== 'A';
  const shouldAnimate = !!isLatestAssistant && !reduceMotion;

  const hasAny =
    (questionnaire && questionnaire.questions && questionnaire.questions.length > 0) ||
    planProposal ||
    (planSuggestions && planSuggestions.length > 0) ||
    (diagnostic && diagnostic.items && diagnostic.items.length > 0) ||
    (canShowUpdates && assessmentUpdates && assessmentUpdates.length > 0) ||
    (mcq && mcq.length > 0) ||
    (fillBlank && fillBlank.length > 0) ||
    (openEnded && openEnded.length > 0) ||
    (grading && Object.keys(grading).length > 0);

  if (!hasAny) return null;

  return (
    <MotionConfig reducedMotion={shouldAnimate ? 'never' : 'always'}>
      <div className="mt-4 mb-2">
        <motion.div
          initial={shouldAnimate ? 'hidden' : false}
          animate={shouldAnimate ? 'visible' : false}
          variants={cardVariants}
          className="marginalia overflow-hidden"
        >
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--rule-light)] bg-[var(--color-muted)]/20">
            <div className="flex items-center gap-2 min-w-0 text-[var(--color-accent)]">
              <AcademicCapIcon className="h-4 w-4" />
              <div className="text-xs font-bold uppercase tracking-wider truncate">
                {title || 'Tutor Tools'}
              </div>
            </div>
          </div>
          <div className="p-4 space-y-6">
            {questionnaire && questionnaire.questions?.length ? (
              <QuestionnaireCard messageId={messageId} questionnaire={questionnaire} />
            ) : null}
            {planProposal ? (
              <PlanProposalCard
                messageId={messageId}
                proposal={planProposal}
                suggestions={planSuggestions}
              />
            ) : null}
            {!planProposal && planSuggestions && planSuggestions.length > 0 ? (
              <PlanSuggestionsCard suggestions={planSuggestions} />
            ) : null}
            {diagnostic && diagnostic.items?.length ? (
              <DiagnosticCard messageId={messageId} diagnostic={diagnostic} />
            ) : null}
            {mcq && mcq.length > 0 && <McqCard messageId={messageId} items={mcq} />}
            {fillBlank && fillBlank.length > 0 && (
              <FillBlankCard messageId={messageId} items={fillBlank} />
            )}
            {openEnded && openEnded.length > 0 && (
              <OpenEndedCard messageId={messageId} items={openEnded} grading={grading} />
            )}
            {canShowUpdates && assessmentUpdates && assessmentUpdates.length > 0 && (
              <LearnerUpdatesCard updates={assessmentUpdates} />
            )}
            {grading && Object.keys(grading).length > 0 && (
              <GradingFeedbackCard grading={grading} />
            )}
          </div>
        </motion.div>
      </div>
    </MotionConfig>
  );
}
