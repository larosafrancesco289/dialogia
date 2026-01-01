import type { ToolDefinition } from '@/lib/agent/types';
import { toJsonSchema } from '@/lib/schemas/jsonSchema';
import { TutorPlanSuggestionsToolSchema } from '@/lib/schemas/tutor';

export const getPlanSuggestionsTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'get_plan_suggestions',
    description:
      'Offer targeted improvements to the current plan without replacing it entirely. Use this when the learner wants adjustments or when you spot a better sequencing or prerequisite alignment. Provide concise, actionable suggestions that can be applied or discussed.',
    parameters: toJsonSchema(TutorPlanSuggestionsToolSchema),
  },
};
