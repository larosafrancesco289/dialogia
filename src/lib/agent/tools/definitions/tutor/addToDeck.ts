import type { ToolDefinition } from '@/lib/agent/types';

export const addToDeckTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'add_to_deck',
    description:
      'Add flashcards to the learner’s spaced repetition deck. Use this when the learner wants to save a card for later review.',
    parameters: {
      type: 'object',
      properties: {
        cards: {
          type: 'array',
          minItems: 1,
          maxItems: 20,
          items: {
            type: 'object',
            required: ['front', 'back'],
            properties: {
              front: { type: 'string' },
              back: { type: 'string' },
              hint: { type: 'string' },
              topic: { type: 'string' },
              skill: { type: 'string' },
            },
          },
        },
      },
      required: ['cards'],
    },
  },
};
