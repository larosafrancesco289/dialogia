import type { ToolDefinition } from '@/lib/agent/types';

export const getPlanSuggestionsTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'get_plan_suggestions',
    description:
      'Offer targeted improvements to the current plan without replacing it entirely. Use this when the learner wants adjustments or when you spot a better sequencing or prerequisite alignment. Provide concise, actionable suggestions that can be applied or discussed.',
    parameters: {
      type: 'object',
      properties: {
        suggestions: {
          type: 'array',
          minItems: 1,
          maxItems: 6,
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
      required: ['suggestions'],
    },
  },
};
