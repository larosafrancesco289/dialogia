import type { ToolDefinition } from '@/lib/transport/contracts';
import { toJsonSchema } from '@/lib/schemas/jsonSchema';
import { TutorPlanProposalToolSchema } from '@/lib/schemas/tutor';

export const learningPlanTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'learning_plan',
    description: `Create or update the learner's personalized learning plan. Use this after intake to propose an initial plan, or later to revise based on progress, new constraints, or diagnostic results.

The tool automatically detects whether to create (no existing plan) or update (plan exists). Include a rationale explaining your pedagogical reasoning for the plan structure.

Optionally include suggestions for future plan evolution that you've identified but aren't implementing yet.`,
    parameters: toJsonSchema(TutorPlanProposalToolSchema),
  },
};
