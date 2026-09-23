import { motion, MotionConfig, useReducedMotion } from 'framer-motion';
import { AcademicCapIcon } from '@heroicons/react/24/outline';
import type {
  TutorDiagnostic,
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

// Mastery changes from assessments are not shown here: the margin notes
// under the message state them once, with their reasons.
export function TutorPanel(props: {
  messageId: string;
  title?: string;
  mcq?: TutorMCQItem[];
  questionnaire?: TutorQuestionnaire;
  diagnostic?: TutorDiagnostic;
  planProposal?: TutorPlanProposal;
  planSuggestions?: TutorPlanSuggestion[];
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
    isLatestAssistant,
  } = props;

  const shouldAnimate = !!isLatestAssistant && !reduceMotion;

  const hasAny =
    (questionnaire && questionnaire.questions && questionnaire.questions.length > 0) ||
    planProposal ||
    (planSuggestions && planSuggestions.length > 0) ||
    (diagnostic && diagnostic.items && diagnostic.items.length > 0) ||
    (mcq && mcq.length > 0);

  if (!hasAny) return null;

  return (
    <MotionConfig reducedMotion={shouldAnimate ? 'never' : 'always'}>
      <div className="px-4">
        <motion.div
          initial={shouldAnimate ? 'hidden' : false}
          animate={shouldAnimate ? 'visible' : false}
          variants={cardVariants}
          className="exercise-sheet"
        >
          <div className="exercise-sheet__head">
            <AcademicCapIcon aria-hidden="true" />
            <span className="truncate">{title || 'Exercises'}</span>
          </div>
          <div className="exercise-sheet__body">
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
          </div>
        </motion.div>
      </div>
    </MotionConfig>
  );
}
