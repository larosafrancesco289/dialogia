import type { ToolDefinition } from '@/lib/agent/types';
import { toJsonSchema } from '@/lib/schemas/jsonSchema';
import { TutorQuizMcqToolSchema } from '@/lib/schemas/tutor';

export const quizMcqTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'quiz_mcq',
    description:
      'Provide a short multiple-choice quiz to assess or reinforce learning objectives. Each item should include choices, the correct index, and an explanation so the UI can score and teach.',
    parameters: toJsonSchema(TutorQuizMcqToolSchema),
  },
};
