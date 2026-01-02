import type { ToolDefinition } from '@/lib/transport/contracts';

export const applyLearnerModelFeedbackTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'apply_learner_model_feedback',
    description:
      'Apply user feedback to a learner model update when they explicitly confirm or correct mastery updates. Use this for manual adjustments that should override automatic scoring, and provide rationale and confidence deltas if available.',
    parameters: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Learning plan node id' },
        direction: { type: 'string', enum: ['up', 'down'] },
        magnitude: { type: 'number', description: 'Magnitude of adjustment (0-1)' },
        reason: { type: 'string' },
        estimatedConfidence: { type: 'number' },
        confidenceFloor: { type: 'number' },
        misconceptionId: { type: 'string' },
        misconceptionDescription: { type: 'string' },
      },
      required: ['nodeId'],
    },
  },
};
