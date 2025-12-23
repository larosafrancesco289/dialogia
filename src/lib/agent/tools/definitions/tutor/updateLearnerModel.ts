import type { ToolDefinition } from '@/lib/agent/types';

export const updateLearnerModelTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'update_learner_model',
    description:
      'Update the learner model using structured evidence about performance, misconceptions, and confidence changes. Use this when you have objective evidence (quiz results, explanations, errors) and want to adjust mastery or store misconceptions. Provide weighted evidence so progress tracking can update accurately.',
    parameters: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Learning plan node id' },
        evidence: {
          type: 'array',
          items: {
            type: 'object',
            required: ['type', 'weight'],
            properties: {
              type: { type: 'string' },
              weight: { type: 'number' },
              details: { type: 'string' },
              skill: { type: 'string' },
            },
          },
        },
        misconceptions: {
          type: 'array',
          items: {
            type: 'object',
            required: ['description'],
            properties: {
              description: { type: 'string' },
              severity: { type: 'string' },
              examples: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        notes: { type: 'string' },
        confidenceBefore: { type: 'number' },
        confidenceAfter: { type: 'number' },
        masteryLevel: { type: 'string' },
      },
      required: ['nodeId'],
    },
  },
};
