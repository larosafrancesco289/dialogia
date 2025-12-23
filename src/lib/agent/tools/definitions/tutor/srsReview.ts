import type { ToolDefinition } from '@/lib/agent/types';

export const srsReviewTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'srs_review',
    description:
      'Fetch due flashcards from the learner’s review deck to start a spaced repetition session.',
    parameters: {
      type: 'object',
      properties: {
        due_count: {
          type: 'integer',
          description: 'How many due cards to fetch (1-40).',
          minimum: 1,
          maximum: 40,
        },
      },
    },
  },
};
