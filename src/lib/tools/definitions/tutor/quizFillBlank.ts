import type { ToolDefinition } from '@/lib/transport/contracts';
import { toJsonSchema } from '@/lib/schemas/jsonSchema';
import { TutorQuizFillBlankToolSchema } from '@/lib/schemas/tutor';

export const quizFillBlankTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'quiz_fill_blank',
    description:
      'Create fill-in-the-blank items for quick recall checks. Provide the correct answer and optional aliases so the UI can validate responses.',
    parameters: toJsonSchema(TutorQuizFillBlankToolSchema),
  },
};
