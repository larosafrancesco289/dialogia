import type { ToolDefinition } from '@/lib/transport/contracts';
import { toJsonSchema } from '@/lib/schemas/jsonSchema';
import { TutorFlashcardsToolSchema } from '@/lib/schemas/tutor';

export const flashcardsTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'flashcards',
    description:
      'Provide flashcards for spaced repetition or quick review. Include optional hints and metadata so the learner can save cards to their deck.',
    parameters: toJsonSchema(TutorFlashcardsToolSchema),
  },
};
