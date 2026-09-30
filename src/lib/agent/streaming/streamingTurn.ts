// Module: agent/streaming/streamingTurn
// Responsibility: A turn that streams and calls tools in one loop. Every round
// streams into the reply as it arrives. When a round asks for tools, what it
// wrote is cleared, the tools run, and the next round streams with the sources
// found so far in its system prompt; the first round that answers without a
// tool call is the reply, so the answer is written once. One exception: a
// round whose calls only save or forget memory notes (or were never offered)
// keeps its text, and the round after its writes adds to it (`keepsText`).
// After MAX_PLANNING_ROUNDS tool rounds, or when none of a round's calls may
// run, one closing round answers with tools withheld. A module that asks for
// `loop: 'agent'` gets the visible agent loop in `agentLoop.ts` instead, which
// keeps every round's text.

import { cleanStreamedText, type MessageStreamCallbacks } from '@/lib/agent/streamHandlers';
import { removeOrphanPendingToolCalls } from '@/lib/turns/runtime';
import { MAX_PLANNING_ROUNDS } from '@/lib/agent/policy';
import { applyToolExecutions } from '@/lib/agent/planning/apply';
import { followUpPrompt } from '@/lib/agent/prompts/followUp';
import { updateMessageById } from '@/lib/messages/updateMessageById';
import { applyCacheBreakpoints, buildSystemMessage } from '@/lib/agent/cache';
import { sumUsage } from '@/lib/api/normalizers';
import { MEMORY_FORGET_TOOL, MEMORY_SAVE_TOOL } from '@/lib/tools/definitions/memory';
import type { ModelMessage, ToolCall } from '@/lib/agent/types';
import { looksIncomplete } from '@/lib/agent/streaming/draft';
import {
  captureRound,
  executeStreamCall,
  roundWantsTools,
  type RoundCapture,
} from '@/lib/agent/streaming/streamCall';
import {
  buildResult,
  createUiCallbacks,
  emitPlanResult,
  finalSystemFor,
  offeredToolNames,
  openSession,
  preLogToolCalls,
  scheduleTools,
  type StreamingTurnOptions,
  type StreamingTurnResult,
  type TurnSession,
} from '@/lib/agent/streaming/session';
import { runAgentLoop } from '@/lib/agent/streaming/agentLoop';

export type { StreamingTurnOptions, StreamingTurnResult } from '@/lib/agent/streaming/session';

export async function executeStreamingTurn(
  opts: StreamingTurnOptions,
): Promise<StreamingTurnResult> {
  const session = await openSession(opts);
  if (!session.tools) return streamWithoutTools(session);
  if (opts.loop === 'agent') return runAgentLoop(session);

  const ui = createUiCallbacks(session);
  const messageId = opts.assistantMessage.id;
  // The reply's usage is every round's, not only the one that answered.
  let usage: ReturnType<typeof sumUsage>;
  const stream = async (round: number, toolChoice: 'auto' | 'none') => {
    const capture = await streamRound(session, ui, round, toolChoice);
    usage = sumUsage(usage, capture.extras?.usage);
    return capture;
  };

  let round = await stream(0, 'auto');
  if (!roundWantsTools(round) && shouldRetryFirstRound(session, round)) {
    clearVisibleDraft(session, ui);
    round = await stream(0, 'auto');
  }

  const timestamps = opts.turn.get().ui?.messageTimestamps === true;
  const textOf = (capture: RoundCapture) =>
    cleanStreamedText(capture.full || capture.content, timestamps);
  // The reply's text so far while rounds that only wrote memory keep it on screen.
  let kept = '';
  let reply: string | undefined;

  for (let toolRounds = 1; roundWantsTools(round); toolRounds += 1) {
    const scheduled = scheduleTools(session, round.toolCalls);
    const text = joinRounds(kept, textOf(round));
    const keep = keepsText(session, round, scheduled, text);
    // Once kept, an answer stays: a later round's own words may go, the kept ones never,
    // and every later round is asked to add to them rather than write them again.
    if (keep) kept = text;
    else clearVisibleDraft(session, ui, kept);
    if (scheduled.length > 0) {
      await runToolRound(session, toolRounds, round, scheduled, kept !== '');
    }
    // Pre-logged entries for calls the scheduler dropped would stay "pending"
    // in the ledger forever; executed calls have resolved by now.
    removeOrphanPendingToolCalls({ set: opts.turn.set, chatId: opts.chatId, messageId });
    if (keep && scheduled.length === 0) {
      reply = kept;
      break;
    }
    const closing = scheduled.length === 0 || toolRounds >= MAX_PLANNING_ROUNDS;
    ui.beginRound();
    round = await stream(toolRounds, closing ? 'none' : 'auto');
    if (closing) break;
  }

  const finalSystem = finalSystemFor(session);
  emitPlanResult(session, finalSystem);
  // A kept round's calls are not why the reply ended.
  const finishReason = round.finishReason === 'tool_calls' ? 'stop' : round.finishReason;
  await ui.onDone?.(reply ?? joinRounds(kept, textOf(round)), {
    ...round.extras,
    finishReason,
    usage,
  });
  return buildResult(session, finalSystem);
}

// ── Rounds ──────────────────────────────────────────────────────────────────

/** A single visible stream; the whole turn when no tools are available. */
async function streamWithoutTools(session: TurnSession): Promise<StreamingTurnResult> {
  const finalSystem = finalSystemFor(session);
  emitPlanResult(session, finalSystem);
  await executeStreamCall(session.call, {
    messages: applyCacheBreakpoints(messagesWithSystem(session, finalSystem)),
    tools: undefined,
    toolChoice: undefined,
    callbacks: createUiCallbacks(session),
  });
  return buildResult(session, finalSystem);
}

/**
 * One round, painted as it streams. The first round sends the turn's own
 * system prompt; a round after tools sends it with the sources found so far,
 * so the answer can cite them by number.
 */
async function streamRound(
  session: TurnSession,
  ui: MessageStreamCallbacks,
  round: number,
  toolChoice: 'auto' | 'none',
): Promise<RoundCapture> {
  // Stream indices restart every round; so does the pre-log bookkeeping.
  session.preLoggedToolIndices.clear();
  const { callbacks, round: capture } = captureRound({
    forward: ui,
    onToolCallDelta:
      toolChoice === 'auto' ? (deltas) => preLogToolCalls(session, deltas) : undefined,
  });
  await executeStreamCall(session.call, {
    messages: applyCacheBreakpoints(
      round === 0 ? session.convo : messagesWithSystem(session, finalSystemFor(session)),
    ),
    tools: session.tools,
    toolChoice,
    callbacks,
    round,
  });
  return capture;
}

/**
 * A tool-capable model that answered without a tool and stopped mid-thought
 * gets one more chance. Retrying an aborted turn would stream into a message
 * the user has already walked away from.
 */
function shouldRetryFirstRound(session: TurnSession, round: RoundCapture): boolean {
  return (
    looksIncomplete(round.full || round.content, round.finishReason) &&
    !session.opts.controller.signal.aborted
  );
}

const MEMORY_WRITE_TOOLS = new Set([
  MEMORY_SAVE_TOOL.function.name,
  MEMORY_FORGET_TOOL.function.name,
]);

/**
 * A round whose every call is a memory write, or a call the turn never offered,
 * leaves the reply's text on screen instead of clearing it: a save cannot
 * change the answer, and an unoffered call never runs. When a write ran, the
 * next round adds to that text, reading its own words and the results, so it
 * can finish a preamble or correct a save that failed. When nothing ran,
 * nothing follows, so the text is the reply unless it stops mid-thought.
 * Any other call, `memory_read` included, may change the answer.
 */
function keepsText(
  session: TurnSession,
  round: RoundCapture,
  scheduled: ToolCall[],
  text: string,
): boolean {
  if (!text) return false;
  const offered = offeredToolNames(session);
  const onlyWrites = round.toolCalls.every(
    ({ function: fn }) => MEMORY_WRITE_TOOLS.has(fn.name) || !offered.has(fn.name),
  );
  if (!onlyWrites) return false;
  return scheduled.length > 0 || !looksIncomplete(text, round.finishReason);
}

/** Rounds of one reply, set off by a blank line as `beginRound` shows them. */
function joinRounds(before: string, after: string): string {
  return [before, after].filter(Boolean).join('\n\n');
}

// ── Tool rounds ─────────────────────────────────────────────────────────────

/** Records the model's tool request in the conversation, runs the tools, and appends their results. */
async function runToolRound(
  session: TurnSession,
  round: number,
  capture: RoundCapture,
  scheduled: ToolCall[],
  continuing: boolean,
): Promise<void> {
  const { opts, convo } = session;
  const { chat, chatId, assistantMessage, userContent, controller, turn } = opts;

  convo.push({
    role: 'assistant',
    content: capture.content || '',
    tool_calls: scheduled,
    ...(capture.reasoningDetails !== undefined
      ? { reasoning_details: capture.reasoningDetails }
      : {}),
  });

  session.state = await applyToolExecutions({
    scheduled,
    round,
    convo,
    context: {
      chat,
      chatId,
      assistantMessage,
      userContent,
      searchProvider: session.searchProvider,
      controller,
      set: turn.set,
      get: turn.get,
      persistMessage: turn.persistMessage,
    },
    state: session.state,
  });

  if (session.appendToolFollowUp) {
    convo.push({
      role: 'user',
      content: followUpPrompt({
        searchEnabled: session.searchEnabled,
        searchProvider: session.searchProvider,
        continuing,
      }),
    });
  }
}

// ── Message shaping ─────────────────────────────────────────────────────────

function messagesWithSystem(session: TurnSession, finalSystem: string): ModelMessage[] {
  const system = buildSystemMessage({
    combinedSystem: finalSystem,
    systemStable: session.opts.systemStable,
    systemDynamic: session.opts.systemDynamic,
  });
  // buildSystemMessage always returns a message when combinedSystem is set.
  return [system!, ...session.convo.filter((m) => m.role !== 'system')];
}

// ── UI and store effects ────────────────────────────────────────────────────

/**
 * Takes a round's text off screen: it led to tool calls, so the next round
 * writes the answer. What earlier rounds kept (`kept`) stays.
 */
function clearVisibleDraft(session: TurnSession, ui: MessageStreamCallbacks, kept = ''): void {
  const { turn, chatId, assistantMessage } = session.opts;
  ui.discardPendingText();
  turn.set((store) => {
    const result = updateMessageById(store, chatId, assistantMessage.id, (msg) =>
      msg.content !== kept ? { ...msg, content: kept } : msg,
    );
    return result ?? {};
  });
}
