import type { ToolDefinition } from '@/lib/agent/types';

export const flashcardsTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'flashcards',
    description:
      'Provide flashcards for spaced repetition or quick review. Include optional hints and metadata so the learner can save cards to their deck.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Optional flashcard deck title shown in the UI' },
        items: {
          type: 'array',
          minItems: 1,
          maxItems: 20,
          items: {
            type: 'object',
            required: ['front', 'back'],
            properties: {
              id: { type: 'string' },
              front: { type: 'string' },
              back: { type: 'string' },
              hint: { type: 'string' },
              topic: { type: 'string' },
              skill: { type: 'string' },
              difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
            },
          },
        },
      },
      required: ['items'],
    },
  },
};
