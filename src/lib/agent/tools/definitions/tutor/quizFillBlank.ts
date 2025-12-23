import type { ToolDefinition } from '@/lib/agent/types';

export const quizFillBlankTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'quiz_fill_blank',
    description:
      'Create fill-in-the-blank items for quick recall checks. Provide the correct answer and optional aliases so the UI can validate responses.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Optional quiz title shown in the UI' },
        items: {
          type: 'array',
          minItems: 1,
          maxItems: 12,
          items: {
            type: 'object',
            required: ['prompt', 'answer'],
            properties: {
              id: { type: 'string' },
              prompt: { type: 'string' },
              answer: { type: 'string' },
              aliases: { type: 'array', items: { type: 'string' } },
              explanation: { type: 'string' },
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
