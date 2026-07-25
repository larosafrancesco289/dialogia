// Module: agent/tools/router
// Responsibility: Normalize actionable tool calls for planning/streaming flows,
// consolidating inline detection so planner/handlers don't duplicate parsing logic.

import { createToolCall, normalizeToolCalls } from '@/lib/agent/parsers';
import { extractInlineToolCalls } from '@/lib/tools/json';
import { extractWebSearchArgs } from '@/lib/search';
import { listTools } from '@/lib/tools';
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

  // Content and meta tools are the ones models tend to emit as inline JSON rather
  // than as a real tool call. Ask the registry rather than naming any module's tools.
  const inlineCandidates = [...listTools({ kind: 'content' }), ...listTools({ kind: 'meta' })];
  const inlineCalls = extractInlineToolCalls(content, inlineCandidates);
  if (!inlineCalls.length) return [];

  const availableTools = Array.isArray(toolDefinition) ? toolDefinition : [];
  const supported = inlineCalls.filter((call) =>
    availableTools.some((def) => def.function?.name === call.name),
  );
  return (supported.length ? supported : inlineCalls).map((call, index) =>
    createToolCall(call.name, call.args, `inline_tool_${index}`),
  );
}
