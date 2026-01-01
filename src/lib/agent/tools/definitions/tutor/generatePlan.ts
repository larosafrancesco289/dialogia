import type { ToolDefinition } from '@/lib/agent/types';
import { toJsonSchema } from '@/lib/schemas/jsonSchema';
import { TutorPlanProposalToolSchema } from '@/lib/schemas/tutor';

export const generatePlanTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'generate_plan',
    description:
      'Submit a complete learning plan ready for learner review, including goals, prerequisite structure, estimated effort, and sequencing. Use this only after you have gathered requirements (and diagnostics if needed) so the plan feels personalized and actionable. Explain what approval or next steps are required so the learner knows when the plan will be adopted.',
    parameters: toJsonSchema(TutorPlanProposalToolSchema),
  },
};
