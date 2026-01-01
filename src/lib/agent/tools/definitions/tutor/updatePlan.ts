import type { ToolDefinition } from '@/lib/agent/types';
import { toJsonSchema } from '@/lib/schemas/jsonSchema';
import { TutorPlanProposalToolSchema } from '@/lib/schemas/tutor';

export const updatePlanTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'update_plan',
    description:
      'Propose a revision to an existing learning plan based on new constraints, diagnostics, or learner feedback. Use this when you need to change nodes, objectives, or sequencing. Provide a complete plan with updated nodes so the UI can display the full replacement clearly.',
    parameters: toJsonSchema(TutorPlanProposalToolSchema),
  },
};
