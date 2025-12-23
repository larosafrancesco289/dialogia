import type { ToolDefinition } from '@/lib/agent/types';

export const quizMcqTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'quiz_mcq',
    description:
      'Provide a short multiple-choice quiz to assess or reinforce learning objectives. Each item should include choices, the correct index, and an explanation so the UI can score and teach.',
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
            required: ['question', 'choices'],
            properties: {
              id: { type: 'string' },
              question: { type: 'string' },
              choices: {
                type: 'array',
                minItems: 2,
                maxItems: 6,
                items: { type: 'string' },
              },
              correct: { type: 'integer', minimum: 0, maximum: 5 },
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
