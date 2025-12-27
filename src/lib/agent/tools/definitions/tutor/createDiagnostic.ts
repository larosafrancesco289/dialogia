import type { ToolDefinition } from '@/lib/agent/types';

export const createDiagnosticTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'create_diagnostic',
    description:
      'Assemble a short diagnostic assessment to verify prior knowledge, surface misconceptions, or confirm a learner’s claimed mastery before teaching. Use it when you need objective evidence about readiness, and clearly describe topic, depth, and how results will guide the upcoming plan. Provide high-quality items with explanations so the UI can render, score, and report outcomes without extra clarification.',
    parameters: {
      type: 'object',
      properties: {
        diagnosticId: { type: 'string', description: 'Stable identifier for this diagnostic' },
        topic: {
          type: 'string',
          description: 'Topic or skill focus (e.g., "calculus foundations")',
        },
        depth: {
          type: 'string',
          enum: ['quick', 'moderate', 'comprehensive'],
          description: 'Scope of diagnostic (quick=3-5 Qs, moderate=8-12, comprehensive=15-20)',
        },
        adaptToAnswers: {
          type: 'boolean',
          description: 'If true, difficulty should adapt based on responses',
        },
        quiz: {
          type: 'object',
          description: 'Assessment items rendered to the learner',
          properties: {
            type: {
              type: 'string',
              enum: ['mcq', 'mixed'],
            },
            items: {
              type: 'array',
              minItems: 3,
              maxItems: 20,
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
                  correct: {
                    type: 'integer',
                    minimum: 0,
                    maximum: 5,
                    description: 'Index of correct choice (0-based)',
                  },
                  explanation: { type: 'string' },
                  skill: { type: 'string' },
                  difficulty: {
                    type: 'string',
                    enum: [
                      'beginner',
                      'intermediate',
                      'advanced',
                      'mixed',
                      'easy',
                      'medium',
                      'hard',
                    ],
                  },
                },
              },
            },
            interpretation: {
              type: 'object',
              description: 'Mapping of score ranges to interpretations (e.g., "0-40%": "...")',
              additionalProperties: { type: 'string' },
            },
          },
          required: ['items'],
        },
      },
      required: ['quiz'],
    },
  },
};
