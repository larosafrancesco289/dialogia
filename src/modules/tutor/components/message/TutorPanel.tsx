'use client';
import { motion, MotionConfig, useReducedMotion } from 'framer-motion';
import { AcademicCapIcon } from '@heroicons/react/24/outline';
import type {
  TutorDiagnostic,
  TutorLearnerModelUpdate,
  TutorMCQItem,
  TutorPlanProposal,
  TutorPlanSuggestion,
  TutorQuestionnaire,
} from '@/lib/types';
import { cardVariants } from '@/modules/tutor/components/message/shared';
import { QuestionnaireCard } from '@/modules/tutor/components/message/QuestionnaireCard';
import { PlanProposalCard } from '@/modules/tutor/components/message/PlanProposalCard';
import { PlanSuggestionsCard } from '@/modules/tutor/components/message/PlanSuggestionsCard';
import { DiagnosticCard } from '@/modules/tutor/components/message/DiagnosticCard';
import { McqCard } from '@/modules/tutor/components/message/McqCard';
import { LearnerUpdatesCard } from '@/modules/tutor/components/message/LearnerUpdatesCard';

export function TutorPanel(props: {
  messageId: string;
  title?: string;
  mcq?: TutorMCQItem[];
  questionnaire?: TutorQuestionnaire;
  diagnostic?: TutorDiagnostic;
  planProposal?: TutorPlanProposal;
  planSuggestions?: TutorPlanSuggestion[];
  assessmentUpdates?: TutorLearnerModelUpdate[];
  isLatestAssistant?: boolean;
}) {
  const reduceMotion = useReducedMotion();

  const {
    messageId,
    title,
    mcq,
    questionnaire,
    diagnostic,
    planProposal,
    planSuggestions,
    assessmentUpdates,
    isLatestAssistant,
  } = props;

  const shouldAnimate = !!isLatestAssistant && !reduceMotion;

  const hasAny =
    (questionnaire && questionnaire.questions && questionnaire.questions.length > 0) ||
    planProposal ||
    (planSuggestions && planSuggestions.length > 0) ||
    (diagnostic && diagnostic.items && diagnostic.items.length > 0) ||
    (assessmentUpdates && assessmentUpdates.length > 0) ||
    (mcq && mcq.length > 0);

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
            {assessmentUpdates && assessmentUpdates.length > 0 && (
              <LearnerUpdatesCard updates={assessmentUpdates} />
            )}
          </div>
        </motion.div>
      </div>
    </MotionConfig>
  );
}
