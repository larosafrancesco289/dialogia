// Module: anthropic/streamEvents
// Responsibility: Fold the Messages API's stream events into a turn: the text,
// thinking and tool calls the app is told about, and each response's content
// blocks as a pause_turn continuation sends them back. No I/O, so a recorded
// stream replays through it directly.

import { mergeAnnotations } from '@/lib/api/annotations';
import { ApiError, API_ERROR_CODES } from '@/lib/api/errors';
import { mergeUsage, normalizeUsage, type Usage } from '@/lib/api/normalizers';
import type { ToolCall } from '@/lib/transport/contracts';
import type { StreamCallbacks } from '@/lib/transport/types';
import { isRecord } from '@/lib/utils/guards';
import { parseToolInput, readContainerId } from '@/lib/anthropic/messages';
import { blockAnnotations, citationAnnotation } from '@/lib/anthropic/citations';
import type { AnthropicThinkingBlock } from '@/lib/anthropic/wire';

type PendingToolCall = {
  id?: string;
  name: string;
  arguments: string;
  /** Its block stopped, so the arguments are whole. */
  done?: boolean;
};

/** One response. A continuation's response numbers its blocks from 0 again. */
type StreamRound = {
  /** The content blocks as they arrive, sent back as-is to resume a paused turn. */
  blocks: Array<Record<string, unknown> | undefined>;
  toolInputs: Map<number, string>;
  usage?: Usage;
  /** message_stop arrived: the response ended, rather than the connection. */
  stopped?: boolean;
};

export type StreamTurn = {
  text: string;
  thinkingBlocks: AnthropicThinkingBlock[];
  /** A native web search's results and the reply's citations of them, every round's. */
  annotations: unknown[];
  /** Keyed past every earlier round's blocks, so two rounds' calls never share a key. */
  toolCalls: Map<number, PendingToolCall>;
  stopReason?: unknown;
  stopDetails?: unknown;
  /** The code execution container the turn last ran code in. */
  container?: string;
  round: StreamRound;
  /** The content of the rounds before this one, in order. */
  earlierContent: Array<Record<string, unknown>>;
  /** How many blocks the rounds before this one held. */
  blockBase: number;
  /** Thinking has been shown; a later thinking block opens a new paragraph. */
  thinkingShown: boolean;
  /** A thinking block started after earlier thinking, and has not yet shown text. */
  thinkingBreak: boolean;
};

type StreamEmit = Pick<
  StreamCallbacks,
  'onToken' | 'onReasoningToken' | 'onToolCallDelta' | 'onAnnotations'
>;

function newRound(): StreamRound {
  return { blocks: [], toolInputs: new Map() };
}

export function createStreamTurn(): StreamTurn {
  return {
    text: '',
    thinkingBlocks: [],
    annotations: [],
    toolCalls: new Map(),
    round: newRound(),
    earlierContent: [],
    blockBase: 0,
    thinkingShown: false,
    thinkingBreak: false,
  };
}

/** Moves the turn on to a continuation's response. */
export function startNextRound(turn: StreamTurn): void {
  turn.earlierContent.push(...roundContent(turn));
  turn.blockBase += turn.round.blocks.length;
  turn.round = newRound();
}

/** The round's content, as the message that resumes a paused turn carries it. */
export function roundContent(turn: StreamTurn): Array<Record<string, unknown>> {
  return turn.round.blocks.filter((block): block is Record<string, unknown> => !!block);
}

/**
 * The assistant message the turn adds, every block in the order it arrived,
 * as the next request must send it back: thinking (redacted or not), text
 * with its citations, server tool calls and their results, tool calls.
 */
export function turnContent(turn: StreamTurn): Array<Record<string, unknown>> {
  return [...turn.earlierContent, ...roundContent(turn)];
}

/**
 * The turn's tool calls, in the order they started. One without an id cannot
 * be answered, and one whose block never stopped, or in a response cut off
 * before message_stop, has arguments that never finished: running it would
 * act on an empty or partial input.
 */
export function finishedToolCalls(turn: StreamTurn): ToolCall[] | undefined {
  if (!turn.round.stopped) return undefined;
  const calls: ToolCall[] = [];
  for (const call of turn.toolCalls.values()) {
    if (call.id === undefined || !call.done) continue;
    calls.push({
      id: call.id,
      type: 'function',
      function: { name: call.name, arguments: call.arguments },
    });
  }
  return calls.length > 0 ? calls : undefined;
}

/** Applies one parsed stream event to the turn. Throws on an `error` event. */
export function applyStreamEvent(turn: StreamTurn, payload: unknown, emit: StreamEmit = {}): void {
  if (!isRecord(payload)) return;
  const index = typeof payload.index === 'number' ? payload.index : 0;
  switch (payload.type) {
    case 'error':
      throw streamError(payload);
    case 'message_start':
      if (isRecord(payload.message)) {
        addUsage(turn.round, payload.message.usage);
        turn.container = readContainerId(payload.message.container) ?? turn.container;
      }
      return;
    case 'content_block_start':
      startBlock(turn, index, payload.content_block, emit);
      return;
    case 'content_block_delta':
      applyDelta(turn, index, payload.delta, emit);
      return;
    case 'content_block_stop':
      stopBlock(turn, index);
      return;
    case 'message_delta': {
      const delta = isRecord(payload.delta) ? payload.delta : undefined;
      turn.stopReason = delta?.stop_reason;
      if (delta?.stop_details !== undefined) turn.stopDetails = delta.stop_details;
      turn.container = readContainerId(delta?.container) ?? turn.container;
      addUsage(turn.round, payload.usage);
      return;
    }
    case 'message_stop':
      turn.round.stopped = true;
      return;
  }
}

function streamError(payload: Record<string, unknown>): ApiError {
  const detail = isRecord(payload.error) ? payload.error : payload;
  const message =
    typeof detail.message === 'string'
      ? detail.message
      : typeof detail.error === 'string'
        ? detail.error
        : 'Anthropic stream error';
  return new ApiError({
    code:
      typeof detail.type === 'string' && detail.type.includes('rate')
        ? API_ERROR_CODES.RATE_LIMITED
        : API_ERROR_CODES.PROVIDER_CHAT_FAILED,
    message,
    detail,
  });
}

function addUsage(round: StreamRound, usage: unknown): void {
  round.usage = mergeUsage(round.usage, normalizeUsage(usage as Record<string, number>));
}

/** Adds to the turn's annotations, and reports the whole set when it grew. */
function addAnnotations(turn: StreamTurn, annotations: unknown[], emit: StreamEmit): void {
  const merged = mergeAnnotations(turn.annotations, annotations);
  if (merged.length === turn.annotations.length) return;
  turn.annotations = merged;
  emit.onAnnotations?.(merged);
}

function appended(current: unknown, piece: string): string {
  return `${typeof current === 'string' ? current : ''}${piece}`;
}

function startBlock(turn: StreamTurn, index: number, value: unknown, emit: StreamEmit): void {
  if (!isRecord(value)) return;
  turn.round.blocks[index] = { ...value };
  addAnnotations(turn, blockAnnotations(value), emit);
  // Thinking before and after a tool call (a server-side search, say) arrives
  // as separate blocks with nothing between them.
  if (value.type === 'thinking' && turn.thinkingShown) turn.thinkingBreak = true;
  if (value.type !== 'tool_use' && value.type !== 'server_tool_use') return;

  // A call can arrive whole, with no input deltas after it: a search that code
  // ran (web search's filtering) does. Its input stands when the block stops.
  const input =
    isRecord(value.input) && Object.keys(value.input).length > 0
      ? JSON.stringify(value.input)
      : undefined;
  if (input) turn.round.toolInputs.set(index, input);
  // Server tools run on Anthropic's side: they are not the app's to call.
  if (value.type !== 'tool_use') return;

  const key = turn.blockBase + index;
  turn.toolCalls.set(key, {
    id: typeof value.id === 'string' ? value.id : undefined,
    name: typeof value.name === 'string' ? value.name : '',
    arguments: input ?? '',
  });
  if (typeof value.name === 'string' && value.name) {
    emit.onToolCallDelta?.([{ index: key, function: { name: value.name } }]);
  }
}

function applyDelta(turn: StreamTurn, index: number, value: unknown, emit: StreamEmit): void {
  if (!isRecord(value)) return;
  const block = turn.round.blocks[index];

  if (value.type === 'text_delta' && typeof value.text === 'string') {
    turn.text += value.text;
    emit.onToken?.(value.text);
    if (block?.type === 'text') block.text = appended(block.text, value.text);
    return;
  }
  if (value.type === 'thinking_delta' && typeof value.thinking === 'string') {
    if (value.thinking) {
      emit.onReasoningToken?.(
        turn.thinkingBreak ? `\n\n${value.thinking.trimStart()}` : value.thinking,
      );
      turn.thinkingShown = true;
      turn.thinkingBreak = false;
    }
    if (block?.type === 'thinking') block.thinking = appended(block.thinking, value.thinking);
    return;
  }
  if (value.type === 'signature_delta' && typeof value.signature === 'string') {
    if (block?.type === 'thinking') block.signature = value.signature;
    return;
  }
  if (value.type === 'citations_delta') {
    if (block?.type === 'text' && isRecord(value.citation)) {
      block.citations = [
        ...(Array.isArray(block.citations) ? block.citations : []),
        value.citation,
      ];
    }
    const annotation = citationAnnotation(value.citation);
    if (annotation) addAnnotations(turn, [annotation], emit);
    return;
  }
  if (value.type === 'input_json_delta' && typeof value.partial_json === 'string') {
    const inputs = turn.round.toolInputs;
    inputs.set(index, appended(inputs.get(index), value.partial_json));
  }
}

function stopBlock(turn: StreamTurn, index: number): void {
  const block = turn.round.blocks[index];
  // Only a signed thinking block can be sent back on the next request.
  if (block?.type === 'thinking' && typeof block.signature === 'string' && block.signature) {
    turn.thinkingBlocks.push({
      type: 'thinking',
      thinking: typeof block.thinking === 'string' ? block.thinking : '',
      signature: block.signature,
    });
  }

  const input = parseToolInput(turn.round.toolInputs.get(index));
  if (block?.type === 'tool_use' || block?.type === 'server_tool_use') block.input = input;
  const call = turn.toolCalls.get(turn.blockBase + index);
  if (call) {
    call.arguments = JSON.stringify(input);
    call.done = true;
  }
}
