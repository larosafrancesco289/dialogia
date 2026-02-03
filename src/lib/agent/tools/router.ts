// Module: agent/tools/router
// Responsibility: Normalize actionable tool calls for planning/streaming flows,
// consolidating inline detection so planner/handlers don't duplicate parsing logic.

import { createToolCall, normalizeToolCalls } from '@/lib/agent/parsers';
import { extractTutorToolCalls } from '@/lib/tools/json';
import { extractWebSearchArgs } from '@/lib/search';
import { TUTOR_TOOL_NAMES } from '@/lib/tools/registry';
import type { AssistantModelMessage, ToolCall, ToolDefinition } from '@/lib/agent/types';

export type DetectPlanningToolCallsParams = {
  message: Partial<AssistantModelMessage>;
  toolDefinition?: ToolDefinition[];
};

export function detectPlanningToolCalls({
  message,
  toolDefinition,
}: DetectPlanningToolCallsParams): ToolCall[] {
  const directCalls = normalizeToolCalls(message);
  if (directCalls.length > 0) return directCalls;

  const content = (message as AssistantModelMessage | undefined)?.content;
  if (typeof content !== 'string' || !content.trim()) return [];

  const inlineSearch = extractWebSearchArgs(content);
  if (inlineSearch) {
    return [
      createToolCall('web_search', inlineSearch as Record<string, unknown>, 'inline_web_search'),
    ];
  }

  const tutorCalls = extractTutorToolCalls(content, TUTOR_TOOL_NAMES);
  if (!tutorCalls.length) return [];

  const availableTools = Array.isArray(toolDefinition) ? toolDefinition : [];
  const supported = tutorCalls.filter((call) =>
    availableTools.some((def) => def.function?.name === call.name),
  );
  return (supported.length ? supported : tutorCalls).map((call, index) =>
    createToolCall(call.name, call.args, `inline_tutor_${index}`),
  );
}
