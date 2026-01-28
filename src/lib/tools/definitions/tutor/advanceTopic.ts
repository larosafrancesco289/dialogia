import type { ToolDefinition } from '@/lib/transport/contracts';

export const advanceTopicTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'advance_topic',
    description:
      'Mark the current topic as completed and advance to the next ready topic in the learning plan. Call this when you judge the student has demonstrated sufficient mastery of the current topic. You have full authority over when to advance — use confidence levels, interaction history, and misconception status as informational signals, not hard gates.',
    parameters: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description:
            'The ID of the node to mark as completed. If omitted, the current in-progress node is used.',
        },
        reason: {
          type: 'string',
          description:
            'Brief explanation of why the student is ready to advance (e.g. "demonstrated solid understanding of power rule through conversation and practice problems").',
        },
      },
      required: [],
    },
  },
};
