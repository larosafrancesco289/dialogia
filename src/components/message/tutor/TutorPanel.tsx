'use client';
import { motion } from 'framer-motion';
import { AcademicCapIcon } from '@heroicons/react/24/outline';
import type {
  TutorDiagnostic,
  TutorFillBlankItem,
  TutorFlashcardItem,
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
import { FlashcardsCard } from '@/components/message/tutor/FlashcardsCard';
import { LearnerUpdatesCard } from '@/components/message/tutor/LearnerUpdatesCard';
import { GradingFeedbackCard } from '@/components/message/tutor/GradingFeedbackCard';

export function TutorPanel(props: {
  messageId: string;
  title?: string;
  mcq?: TutorMCQItem[];
  fillBlank?: TutorFillBlankItem[];
  openEnded?: TutorOpenItem[];
  flashcards?: TutorFlashcardItem[];
  questionnaire?: TutorQuestionnaire;
  diagnostic?: TutorDiagnostic;
  planProposal?: TutorPlanProposal;
  planSuggestions?: TutorPlanSuggestion[];
  assessmentUpdates?: TutorLearnerModelUpdate[];
  grading?: Record<string, { score?: number; feedback: string; criteria?: string[] }>;
}) {
  const {
    messageId,
    title,
    mcq,
    fillBlank,
    openEnded,
    flashcards,
    questionnaire,
    diagnostic,
    planProposal,
    planSuggestions,
    assessmentUpdates,
    grading,
  } = props;

  const hasAny =
    (questionnaire && questionnaire.questions && questionnaire.questions.length > 0) ||
    planProposal ||
    (planSuggestions && planSuggestions.length > 0) ||
    (diagnostic && diagnostic.items && diagnostic.items.length > 0) ||
    (assessmentUpdates && assessmentUpdates.length > 0) ||
    (mcq && mcq.length > 0) ||
    (fillBlank && fillBlank.length > 0) ||
    (openEnded && openEnded.length > 0) ||
    (flashcards && flashcards.length > 0) ||
    (grading && Object.keys(grading).length > 0);

  if (!hasAny) return null;

  return (
    <div className="mt-4 mb-2">
      <motion.div
        initial="hidden"
        animate="visible"
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
          {flashcards && flashcards.length > 0 && <FlashcardsCard items={flashcards} />}
          {assessmentUpdates && assessmentUpdates.length > 0 && (
            <LearnerUpdatesCard updates={assessmentUpdates} />
          )}
          {grading && Object.keys(grading).length > 0 && <GradingFeedbackCard grading={grading} />}
        </div>
      </motion.div>
    </div>
  );
}
