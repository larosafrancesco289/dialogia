import type { ToolDefinition } from '@/lib/agent/types';

export const generatePlanTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'generate_plan',
    description:
      'Submit a complete learning plan ready for learner review, including goals, prerequisite structure, estimated effort, and sequencing. Use this only after you have gathered requirements (and diagnostics if needed) so the plan feels personalized and actionable. Explain what approval or next steps are required so the learner knows when the plan will be adopted.',
    parameters: {
      type: 'object',
      properties: {
        plan: {
          type: 'object',
          required: ['goal', 'nodes'],
          properties: {
            goal: { type: 'string' },
            metadata: {
              type: 'object',
              properties: {
                estimatedHours: { type: 'number' },
                difficulty: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'] },
                prerequisites: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
            },
            nodes: {
              type: 'array',
              minItems: 1,
              maxItems: 20,
              items: {
                type: 'object',
                required: ['id', 'name', 'objectives'],
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  objectives: {
                    type: 'array',
                    minItems: 1,
                    maxItems: 6,
                    items: { type: 'string' },
                  },
                  prerequisites: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  estimatedMinutes: { type: 'number' },
                  status: {
                    type: 'string',
                    enum: ['not_started', 'in_progress', 'completed'],
                  },
                  resources: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        title: { type: 'string' },
                        url: { type: 'string' },
                        type: { type: 'string' },
                        notes: { type: 'string' },
                      },
                    },
                  },
                  children: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['id', 'name', 'objectives'],
                      properties: {
                        id: { type: 'string' },
                        name: { type: 'string' },
                        description: { type: 'string' },
                        objectives: {
                          type: 'array',
                          minItems: 1,
                          maxItems: 6,
                          items: { type: 'string' },
                        },
                        prerequisites: {
                          type: 'array',
                          items: { type: 'string' },
                        },
                        estimatedMinutes: { type: 'number' },
                        status: {
                          type: 'string',
                          enum: ['not_started', 'in_progress', 'completed'],
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        requiresConfirmation: {
          type: 'boolean',
          description:
            'Whether the learner must explicitly approve the plan before it is adopted.',
        },
        confirmationMessage: {
          type: 'string',
          description: 'Message explaining how to approve or request changes.',
        },
        suggestions: {
          type: 'array',
          items: {
            type: 'object',
            required: ['action'],
            properties: {
              action: { type: 'string' },
              priority: { type: 'string', enum: ['low', 'medium', 'high'] },
              description: { type: 'string' },
              rationale: { type: 'string' },
              estimatedImpact: { type: 'string' },
              implementationDetails: { type: 'object' },
            },
          },
        },
      },
      required: ['plan'],
    },
  },
};
