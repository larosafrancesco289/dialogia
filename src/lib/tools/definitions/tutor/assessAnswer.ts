import type { ToolDefinition } from '@/lib/transport/contracts';

export const assessAnswerTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'assess_answer',
    description:
      'Record a learner interaction with enough detail to update the learner model, including the question, answer, correctness, and difficulty. Use this when you want to log evidence without generating new UI exercises.',
    parameters: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Learning plan node id' },
        interaction: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            studentAnswer: { type: 'string' },
            correctAnswer: { type: 'string' },
            questionType: { type: 'string' },
            skill: { type: 'string' },
            difficulty: { type: 'string' },
            hintsUsed: { type: 'number' },
            correct: { type: 'boolean' },
          },
          required: ['question', 'studentAnswer'],
        },
      },
      required: ['nodeId', 'interaction'],
    },
  },
};
