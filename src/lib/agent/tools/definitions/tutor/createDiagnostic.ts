import type { ToolDefinition } from '@/lib/agent/types';
import { toJsonSchema } from '@/lib/schemas/jsonSchema';
import { TutorDiagnosticToolSchema } from '@/lib/schemas/tutor';

export const createDiagnosticTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'create_diagnostic',
    description:
      'Assemble a short diagnostic assessment to verify prior knowledge, surface misconceptions, or confirm a learner’s claimed mastery before teaching. Use it when you need objective evidence about readiness, and clearly describe topic, depth, and how results will guide the upcoming plan. Provide high-quality items with explanations so the UI can render, score, and report outcomes without extra clarification.',
    parameters: toJsonSchema(TutorDiagnosticToolSchema),
  },
};
