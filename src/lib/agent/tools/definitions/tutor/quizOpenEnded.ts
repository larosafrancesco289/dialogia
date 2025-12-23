import type { ToolDefinition } from '@/lib/agent/types';

export const quizOpenEndedTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'quiz_open_ended',
    description:
      'Create open-ended questions that require a free-form response. Provide sample answers or rubrics so the UI can display guidance and grading hints.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Optional quiz title shown in the UI' },
        items: {
          type: 'array',
          minItems: 1,
          maxItems: 8,
          items: {
            type: 'object',
            required: ['prompt'],
            properties: {
              id: { type: 'string' },
              prompt: { type: 'string' },
              sample_answer: { type: 'string' },
              rubric: { type: 'string' },
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
