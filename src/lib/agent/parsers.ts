// Module: agent/parsers
// Responsibility: Provide shared helpers for normalizing and handling tool call payloads.

import type { ToolCall } from '@/lib/agent/types';

export function normalizeToolCalls(message: unknown): ToolCall[] {
  const calls: ToolCall[] = [];
  const rawCalls = Array.isArray((message as any)?.tool_calls)
    ? (message as any).tool_calls
    : [];
  rawCalls.forEach((call: any, index: number) => {
    const name = typeof call?.function?.name === 'string' ? call.function.name : '';
    const args = typeof call?.function?.arguments === 'string' ? call.function.arguments : '';
    if (!name || !args) return;
    const id = typeof call?.id === 'string' ? call.id : `call_${index}`;
    calls.push({ id, type: 'function', function: { name, arguments: args } });
  });
  if (calls.length > 0) return calls;

  const legacy = (message as any)?.function_call;
  if (legacy && typeof legacy === 'object') {
    const name = typeof legacy.name === 'string' ? legacy.name : '';
    const args = typeof legacy.arguments === 'string' ? legacy.arguments : '';
    if (name && args) {
      return [{ id: 'call_0', type: 'function', function: { name, arguments: args } }];
    }
  }
  return [];
}

export function createToolCall(
  name: string,
  args: Record<string, unknown>,
  id: string,
): ToolCall {
  return {
    id,
    type: 'function',
    function: { name, arguments: JSON.stringify(args) },
  };
}

export function parseToolArguments(call: ToolCall): Record<string, unknown> {
  try {
    const parsed = JSON.parse(call.function.arguments);
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
}
