import type { ToolDefinition } from '@/lib/transport/contracts';

export const recordLearningTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'record_learning',
    description: `Record evidence of learning to update the learner model. Use this after any learner interaction (quiz answer, explanation request, practice attempt) to track mastery changes and misconceptions.

Sources:
- 'assessment': You observed and assessed the learner's response
- 'self_report': The learner provided feedback about their own understanding

Always call this after quiz interactions or when you observe evidence of learning or misconceptions.`,
    parameters: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description:
            'The EXACT node ID from the learning plan (shown in square brackets, e.g. "limit-definition", "power-rule"). Do NOT invent or abbreviate node IDs.',
        },
        source: {
          type: 'string',
          enum: ['assessment', 'self_report'],
          description:
            "Source of the evidence. Use 'assessment' when YOU observed the learner's performance. Use 'self_report' when the STUDENT says their mastery score is wrong or requests a confidence adjustment.",
        },
        // For assessment source
        interaction: {
          type: 'object',
          description: 'Details of the learner interaction (for assessment source)',
          properties: {
            question: { type: 'string' },
            studentAnswer: { type: 'string' },
            correctAnswer: { type: 'string' },
            isCorrect: { type: 'boolean' },
            questionType: { type: 'string' },
            hintsUsed: { type: 'number' },
          },
        },
        evidence: {
          type: 'array',
          description: 'Evidence entries for mastery update',
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
          description: 'Misconceptions observed',
          items: {
            type: 'object',
            required: ['description'],
            properties: {
              id: { type: 'string' },
              description: { type: 'string' },
              severity: { type: 'string' },
              examples: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        // For self_report source
        confidenceAdjustment: {
          type: 'object',
          description: 'Adjustment based on learner self-report',
          properties: {
            direction: { type: 'string', enum: ['up', 'down'] },
            magnitude: { type: 'number', description: 'Magnitude of adjustment (0-1)' },
            reason: { type: 'string' },
          },
        },
        estimatedConfidence: {
          type: 'number',
          description: 'Learner self-reported confidence (0-1). Only increases confidence.',
        },
        confidenceFloor: {
          type: 'number',
          description: 'Minimum confidence to enforce (0-1). Only increases confidence.',
        },
        misconceptionId: {
          type: 'string',
          description: 'Resolve a known misconception by id (self_report)',
        },
        misconceptionDescription: {
          type: 'string',
          description: 'Resolve a known misconception by description (self_report)',
        },
        notes: { type: 'string', description: 'Additional notes about the learning event' },
      },
      required: ['nodeId', 'source'],
    },
  },
};
