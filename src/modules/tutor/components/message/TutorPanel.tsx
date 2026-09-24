import { motion, MotionConfig, useReducedMotion } from 'framer-motion';
import { AcademicCapIcon } from '@heroicons/react/24/outline';
import { cardVariants } from '@/modules/tutor/components/message/shared';
import { QuestionnaireCard } from '@/modules/tutor/components/message/QuestionnaireCard';
import { PlanProposalCard } from '@/modules/tutor/components/message/PlanProposalCard';
import { DiagnosticCard } from '@/modules/tutor/components/message/DiagnosticCard';
import { QuizCard } from '@/modules/tutor/components/message/McqCard';
import type { MessageCards } from '@/modules/tutor/ui/messageViews';

// Mastery changes from assessments are not shown here: the margin notes
// under the message state them once, with their reasons.
export function TutorPanel(props: {
  chatId: string;
  messageId: string;
  cards: MessageCards;
  isLatestAssistant?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const { chatId, messageId, cards, isLatestAssistant } = props;
  const { intake, diagnostic, quiz, proposal } = cards;

  const shouldAnimate = !!isLatestAssistant && !reduceMotion;
  const hasAny =
    !!intake?.questions.length || !!proposal || !!diagnostic?.items.length || !!quiz?.items.length;
  if (!hasAny) return null;

  const title = quiz?.title ?? intake?.title ?? (proposal ? 'Learning plan' : undefined);

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
            {intake && intake.questions.length ? (
              <QuestionnaireCard chatId={chatId} messageId={messageId} intake={intake} />
            ) : null}
            {proposal ? (
              <PlanProposalCard chatId={chatId} messageId={messageId} proposal={proposal} />
            ) : null}
            {diagnostic && diagnostic.items.length ? (
              <DiagnosticCard chatId={chatId} messageId={messageId} diagnostic={diagnostic} />
            ) : null}
            {quiz && quiz.items.length > 0 && (
              <QuizCard chatId={chatId} messageId={messageId} quiz={quiz} />
            )}
          </div>
        </motion.div>
      </div>
    </MotionConfig>
  );
}
