import type { ToolDefinition } from '@/lib/agent/types';
import { toJsonSchema } from '@/lib/schemas/jsonSchema';
import { TutorQuizOpenEndedToolSchema } from '@/lib/schemas/tutor';

export const quizOpenEndedTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'quiz_open_ended',
    description:
      'Create open-ended questions that require a free-form response. Provide sample answers or rubrics so the UI can display guidance and grading hints.',
    parameters: toJsonSchema(TutorQuizOpenEndedToolSchema),
  },
};
