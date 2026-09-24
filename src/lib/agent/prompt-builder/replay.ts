// Module: agent/prompt-builder/replay
// Responsibility: Turn an assistant message's stored tool rounds back into the
// real assistant{content, tool_calls} and tool messages the model produced, in
// order, so a later turn sees what it did rather than a prose summary of it.

import type { MessageToolRound } from '@/lib/types';
import type { ModelMessage, ToolCall } from '@/lib/agent/types';

type ReplaySegment = { text: string; calls?: MessageToolRound['calls'] };

/**
 * Splits a message's content into its rounds and the closing text. The rounds'
 * texts are, joined by blank lines, a prefix of the content the loop wrote. When
 * they are not (the user edited the reply), the edit wins: the calls replay with
 * no text of their own and the whole edited content closes the turn.
 */
export function splitReplaySegments(content: string, rounds: MessageToolRound[]): ReplaySegment[] {
  const body = content.trim();
  const texts = rounds.map((round) => round.text.trim());
  const prefix = texts.filter(Boolean).join('\n\n');
  const intact = body.startsWith(prefix);
  const segments: ReplaySegment[] = rounds.map((round, index) => ({
    text: intact ? texts[index] : '',
    calls: round.calls,
  }));
  segments.push({ text: intact ? body.slice(prefix.length).trim() : body });
  return segments;
}

/** Provider-safe, request-unique tool-call ids (Anthropic accepts `[A-Za-z0-9_-]+` only). */
export function createToolCallIdAllocator() {
  const used = new Set<string>();
  return (raw: string): string => {
    const base = raw.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64) || `call_${used.size}`;
    let id = base;
    for (let n = 2; used.has(id); n += 1) id = `${base}_${n}`;
    used.add(id);
    return id;
  };
}

/**
 * The model messages for one assistant turn with tool rounds. `decorate` adds
 * the timestamp prefix to the first text; `annotations` ride on the last
 * assistant message, as they would on a plain reply.
 */
export function replayAssistantTurn(args: {
  content: string;
  rounds: MessageToolRound[];
  allocateId: (raw: string) => string;
  decorate?: (text: string) => string;
  annotations?: unknown;
}): ModelMessage[] {
  const { rounds, allocateId, decorate, annotations } = args;
  const out: ModelMessage[] = [];
  let decorated = !decorate;
  const withDecoration = (text: string) => {
    if (decorated || !text) return text;
    decorated = true;
    return decorate!(text);
  };

  let lastAssistant = -1;
  for (const segment of splitReplaySegments(args.content, rounds)) {
    if (!segment.calls) {
      if (!segment.text) continue;
      lastAssistant = out.length;
      out.push({ role: 'assistant', content: withDecoration(segment.text) });
      continue;
    }
    const calls = segment.calls.map((call) => ({ ...call, id: allocateId(call.id) }));
    const toolCalls: ToolCall[] = calls.map((call) => ({
      id: call.id,
      type: 'function',
      function: { name: call.name, arguments: call.arguments || '{}' },
    }));
    lastAssistant = out.length;
    out.push({ role: 'assistant', content: withDecoration(segment.text), tool_calls: toolCalls });
    for (const call of calls) {
      out.push({ role: 'tool', name: call.name, tool_call_id: call.id, content: call.result });
    }
  }

  if (annotations && lastAssistant >= 0) {
    out[lastAssistant] = { ...out[lastAssistant], annotations } as ModelMessage;
  }
  return out;
}
