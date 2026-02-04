import type { ToolDefinition } from '@/lib/transport/contracts';
import { advanceTopicTool } from './advanceTopic';
import { askStudentQuestionTool } from './askStudentQuestion';
import { createDiagnosticTool } from './createDiagnostic';
import { learningPlanTool } from './learningPlan';
import { quizTool } from './quiz';
import { recordLearningTool } from './recordLearning';

export const TUTOR_TOOL_DEFINITIONS: ToolDefinition[] = [
  askStudentQuestionTool,
  createDiagnosticTool,
  learningPlanTool,
  recordLearningTool,
  advanceTopicTool,
  quizTool,
];

export function getTutorToolDefinitions(): ToolDefinition[] {
  return TUTOR_TOOL_DEFINITIONS;
}
