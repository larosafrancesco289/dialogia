import type { ToolDefinition } from '@/lib/agent/types';

export const gradeOpenResponseTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'grade_open_response',
    description:
      'Grade a learner’s open-ended response and provide feedback. Use this after the learner submits an answer to an open-ended item so the UI can display the score and feedback.',
    parameters: {
      type: 'object',
      properties: {
        item_id: { type: 'string', description: 'Open-ended item id to grade' },
        feedback: { type: 'string', description: 'Feedback to display to the learner' },
        score: { type: 'number', description: 'Normalized score (0-1)' },
        criteria: { type: 'array', items: { type: 'string' } },
      },
      required: ['item_id', 'feedback'],
    },
  },
};
