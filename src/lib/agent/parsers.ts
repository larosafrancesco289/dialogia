// Module: agent/parsers
// Responsibility: Provide shared helpers for normalizing and handling tool call payloads.

import type { ToolCall } from '@/lib/agent/types';
import { isRecord } from '@/lib/utils/guards';

export function normalizeToolCalls(message: unknown): ToolCall[] {
  const calls: ToolCall[] = [];
  const record = isRecord(message) ? message : undefined;
  const rawCalls = Array.isArray(record?.tool_calls) ? record?.tool_calls : [];
  rawCalls.forEach((call, index) => {
    const callRecord = isRecord(call) ? call : undefined;
    const fnRecord = isRecord(callRecord?.function) ? callRecord?.function : undefined;
    const name = typeof fnRecord?.name === 'string' ? fnRecord.name : '';
    const args = typeof fnRecord?.arguments === 'string' ? fnRecord.arguments : '';
    if (!name || !args) return;
    const id = typeof callRecord?.id === 'string' ? callRecord.id : `call_${index}`;
    // Preserve the original tool call object to retain provider-specific fields
    // (e.g., Gemini's thought_signature required for function calling)
    const normalizedCall: ToolCall = {
      ...callRecord,
      id,
      type: 'function',
      function: { name, arguments: args },
    };
    calls.push(normalizedCall);
  });
  if (calls.length > 0) return calls;

  const legacy = isRecord(record?.function_call) ? record?.function_call : undefined;
  if (legacy) {
    const name = typeof legacy.name === 'string' ? legacy.name : '';
    const args = typeof legacy.arguments === 'string' ? legacy.arguments : '';
    if (name && args) {
      return [{ id: 'call_0', type: 'function', function: { name, arguments: args } }];
    }
  }
  return [];
}

export function createToolCall(name: string, args: Record<string, unknown>, id: string): ToolCall {
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
