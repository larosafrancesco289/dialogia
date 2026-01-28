import type { ToolDefinition } from '@/lib/transport/contracts';
import { addToDeckTool } from './addToDeck';
import { advanceTopicTool } from './advanceTopic';
import { applyLearnerModelFeedbackTool } from './applyLearnerModelFeedback';
import { assessAnswerTool } from './assessAnswer';
import { askStudentQuestionTool } from './askStudentQuestion';
import { createDiagnosticTool } from './createDiagnostic';
import { flashcardsTool } from './flashcards';
import { generatePlanTool } from './generatePlan';
import { getPlanSuggestionsTool } from './getPlanSuggestions';
import { gradeOpenResponseTool } from './gradeOpenResponse';
import { quizFillBlankTool } from './quizFillBlank';
import { quizMcqTool } from './quizMcq';
import { quizOpenEndedTool } from './quizOpenEnded';
import { srsReviewTool } from './srsReview';
import { updateLearnerModelTool } from './updateLearnerModel';
import { updatePlanTool } from './updatePlan';

export function getTutorToolDefinitions(): ToolDefinition[] {
  return [
    askStudentQuestionTool,
    createDiagnosticTool,
    generatePlanTool,
    updatePlanTool,
    getPlanSuggestionsTool,
    assessAnswerTool,
    applyLearnerModelFeedbackTool,
    updateLearnerModelTool,
    advanceTopicTool,
    quizMcqTool,
    quizFillBlankTool,
    quizOpenEndedTool,
    flashcardsTool,
    gradeOpenResponseTool,
    addToDeckTool,
    srsReviewTool,
  ];
}
