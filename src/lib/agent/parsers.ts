// Module: agent/parsers
// Responsibility: Provide shared helpers for normalizing and handling tool call payloads.

import type { ToolCall } from '@/lib/agent/types';

export function parseToolArguments(call: ToolCall): Record<string, unknown> {
  try {
    const parsed = JSON.parse(call.function.arguments);
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
}
