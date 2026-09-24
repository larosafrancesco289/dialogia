// Module: transport/toolHistory
// Responsibility: Fold tool traffic out of a conversation for a request that
// offers no tools. Replayed tool rounds put real tool calls and results in the
// history, and a provider that is sent those without tool definitions (or an
// endpoint that does not declare tool support) may reject the whole request.

import type { ModelMessage } from '@/lib/transport/contracts';

const hasToolCalls = (message: ModelMessage): boolean =>
  message.role === 'assistant' &&
  Array.isArray(message.tool_calls) &&
  message.tool_calls.length > 0;

export function hasToolHistory(messages: ModelMessage[]): boolean {
  return messages.some((message) => message.role === 'tool' || hasToolCalls(message));
}

/**
 * Tool results are dropped, assistant tool calls keep only their text, and the
 * text left next to another assistant message is joined to it with a blank
 * line. Messages with no tool traffic pass through untouched.
 */
export function withoutToolHistory(messages: ModelMessage[]): ModelMessage[] {
  if (!hasToolHistory(messages)) return messages;
  const out: ModelMessage[] = [];
  let lastWasFolded = false;
  for (const message of messages) {
    if (message.role === 'tool') continue;
    const folded = hasToolCalls(message);
    let next = message;
    if (folded && message.role === 'assistant') {
      const { tool_calls: _calls, reasoning_details: _reasoning, ...rest } = message;
      const text = typeof rest.content === 'string' ? rest.content : '';
      if (!text.trim() && !Array.isArray(rest.content)) {
        lastWasFolded = true;
        continue;
      }
      next = rest;
    }
    const prev = out[out.length - 1];
    if (
      (folded || lastWasFolded) &&
      next.role === 'assistant' &&
      prev?.role === 'assistant' &&
      typeof prev.content === 'string' &&
      typeof next.content === 'string'
    ) {
      out[out.length - 1] = {
        ...prev,
        ...next,
        content: [prev.content, next.content].filter((text) => text.trim()).join('\n\n'),
      };
    } else {
      out.push(next);
    }
    lastWasFolded = folded;
  }
  return out;
}
