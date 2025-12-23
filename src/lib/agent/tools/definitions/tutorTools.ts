import type { ToolDefinition } from '@/lib/agent/types';
import { addToDeckTool } from '@/lib/agent/tools/definitions/tutor/addToDeck';
import { applyLearnerModelFeedbackTool } from '@/lib/agent/tools/definitions/tutor/applyLearnerModelFeedback';
import { assessAnswerTool } from '@/lib/agent/tools/definitions/tutor/assessAnswer';
import { askStudentQuestionTool } from '@/lib/agent/tools/definitions/tutor/askStudentQuestion';
import { createDiagnosticTool } from '@/lib/agent/tools/definitions/tutor/createDiagnostic';
import { flashcardsTool } from '@/lib/agent/tools/definitions/tutor/flashcards';
import { generatePlanTool } from '@/lib/agent/tools/definitions/tutor/generatePlan';
import { getPlanSuggestionsTool } from '@/lib/agent/tools/definitions/tutor/getPlanSuggestions';
import { gradeOpenResponseTool } from '@/lib/agent/tools/definitions/tutor/gradeOpenResponse';
import { quizFillBlankTool } from '@/lib/agent/tools/definitions/tutor/quizFillBlank';
import { quizMcqTool } from '@/lib/agent/tools/definitions/tutor/quizMcq';
import { quizOpenEndedTool } from '@/lib/agent/tools/definitions/tutor/quizOpenEnded';
import { srsReviewTool } from '@/lib/agent/tools/definitions/tutor/srsReview';
import { updateLearnerModelTool } from '@/lib/agent/tools/definitions/tutor/updateLearnerModel';
import { updatePlanTool } from '@/lib/agent/tools/definitions/tutor/updatePlan';

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
    quizMcqTool,
    quizFillBlankTool,
    quizOpenEndedTool,
    flashcardsTool,
    gradeOpenResponseTool,
    addToDeckTool,
    srsReviewTool,
  ];
}
