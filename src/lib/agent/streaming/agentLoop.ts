// Module: agent/streaming/agentLoop
// Responsibility: The visible agent loop a module asks for with `loop: 'agent'`.
// Every round streams into the same reply (successive rounds set off by a blank
// line); when a round calls tools they run, their results go back to the model,
// and the next round streams. The loop ends when the model stops calling tools,
// when a handler says the turn ends (a card now waits for the user), or at the
// round cap, whose last round is sent with tool_choice 'none'. There is no draft
// clearing, no silent round, no short-circuit and no follow-up nudge here.

import { cleanStreamedText, type MessageStreamCallbacks } from '@/lib/agent/streamHandlers';
import { sumUsage } from '@/lib/api/normalizers';
import { applyCacheBreakpoints } from '@/lib/agent/cache';
import { applyToolExecutions, type ToolCallOutcome } from '@/lib/agent/planning/apply';
import { updateMessageById } from '@/lib/messages/updateMessageById';
import { isReplayTool } from '@/lib/tools';
import type { ToolResult } from '@/lib/tools/execution';
import { removeOrphanPendingToolCalls, settlePendingToolCalls } from '@/lib/turns/runtime';
import type { MessageToolRound, MessageToolRoundCall } from '@/lib/types';
import type { ModelMessage, ToolCall } from '@/lib/agent/types';
import type { StreamDoneExtras } from '@/lib/transport/types';
import {
  captureRound,
  executeStreamCall,
  type RoundCapture,
} from '@/lib/agent/streaming/streamCall';
import {
  buildResult,
  createUiCallbacks,
  emitPlanResult,
  finalSystemFor,
  preLogToolCalls,
  scheduleTools,
  type StreamingTurnResult,
  type TurnSession,
} from '@/lib/agent/streaming/session';

/** Model calls per agent turn; the last one may not call tools. */
export const AGENT_MAX_ROUNDS = 5;

const NOT_RUN: ToolResult = {
  ok: false,
  error: 'This call was not run.',
  hint: 'The tool is not available right now, or its budget for this turn is spent. Carry on without it.',
};

export async function runAgentLoop(session: TurnSession): Promise<StreamingTurnResult> {
  const { opts } = session;
  const { turn, chatId, assistantMessage, controller } = opts;
  const ui = createUiCallbacks(session);
  const timestamps = turn.get().ui?.messageTimestamps === true;
  const texts: string[] = [];
  const replay = createReplayRecorder();
  const repeats = createRepeatWatch();
  let extras: StreamDoneExtras | undefined;

  try {
    for (let round = 1; round <= AGENT_MAX_ROUNDS; round += 1) {
      if (controller.signal.aborted) throw abortError();
      const lastRound = round === AGENT_MAX_ROUNDS;
      if (round > 1) ui.beginRound();
      // Stream indices restart every round; so does the pre-log bookkeeping.
      session.preLoggedToolIndices.clear();

      const capture = await streamRound(session, ui, round, lastRound);
      extras = { ...capture.extras, usage: sumUsage(extras?.usage, capture.extras?.usage) };
      const text = cleanStreamedText(capture.full || capture.content, timestamps);
      if (text) texts.push(text);

      // A tool call in the stream counts whatever the finish reason says: some
      // providers report 'stop' alongside calls.
      if (lastRound || capture.toolCalls.length === 0) break;

      const outcomes = repeats.check(session.convo, await runToolRound(session, round, capture));
      replay.record(text, outcomes);
      storeToolRounds(session, replay.rounds());
      if (outcomes.some((outcome) => outcome.endsTurn)) break;
    }
  } catch (error) {
    // A stream that fails or is stopped has already told the UI callbacks,
    // which persist what streamed; anything else (a stop between rounds, a
    // failure outside the stream) is reported to them here. Either way the
    // ledger must not keep spinning.
    removeOrphanPendingToolCalls({ set: turn.set, chatId, messageId: assistantMessage.id });
    settlePendingToolCalls({
      set: turn.set,
      chatId,
      messageId: assistantMessage.id,
      error: controller.signal.aborted ? 'Stopped' : 'The turn failed before this call ran',
    });
    if (!isStreamError(error)) {
      ui.onError?.(
        controller.signal.aborted
          ? abortError()
          : error instanceof Error
            ? error
            : new Error(String(error)),
      );
    } else {
      // The stream's own onError saved the message before the ledger settled.
      const current = turn.get().messagesById[assistantMessage.id];
      if (current) await turn.persistMessage(current).catch(() => undefined);
    }
    throw error;
  }

  removeOrphanPendingToolCalls({ set: turn.set, chatId, messageId: assistantMessage.id });
  const finalSystem = finalSystemFor(session);
  emitPlanResult(session, finalSystem);
  await ui.onDone?.(texts.join('\n\n'), extras);
  return buildResult(session, finalSystem);
}

async function streamRound(
  session: TurnSession,
  ui: MessageStreamCallbacks,
  round: number,
  lastRound: boolean,
): Promise<RoundCapture> {
  const { callbacks, round: capture } = captureRound({
    forward: ui,
    onToolCallDelta: lastRound ? undefined : (deltas) => preLogToolCalls(session, deltas),
  });
  const streamError = markStreamErrors(callbacks);
  try {
    await executeStreamCall(session.call, {
      messages: applyCacheBreakpoints(session.convo),
      tools: session.tools,
      toolChoice: lastRound ? 'none' : 'auto',
      callbacks,
      round: round - 1,
    });
  } catch (error) {
    throw streamError(error);
  }
  return capture;
}

/**
 * Records the round in the conversation, runs what the scheduler allows, and
 * answers every call the model made: a call the scheduler dropped gets an error
 * result, so the model hears why instead of meeting an unanswered call.
 */
async function runToolRound(
  session: TurnSession,
  round: number,
  capture: RoundCapture,
): Promise<ToolCallOutcome[]> {
  const { opts, convo } = session;
  const { chat, chatId, assistantMessage, userContent, controller, turn } = opts;
  const calls = capture.toolCalls;
  const scheduled = scheduleTools(session, calls);

  convo.push({
    role: 'assistant',
    content: capture.full || capture.content || '',
    tool_calls: calls,
    ...(capture.reasoningDetails !== undefined
      ? { reasoning_details: capture.reasoningDetails }
      : {}),
  });

  const outcomes: ToolCallOutcome[] = [];
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
    agentLoop: true,
    onOutcome: (outcome) => outcomes.push(outcome),
  });

  const ran = new Set(scheduled);
  for (const call of calls) {
    if (ran.has(call)) continue;
    convo.push({
      role: 'tool',
      name: call.function.name,
      tool_call_id: call.id,
      content: JSON.stringify(NOT_RUN),
    });
  }

  // Pre-logged entries for calls the scheduler dropped would stay "pending"
  // in the ledger forever; executed calls have resolved by now.
  removeOrphanPendingToolCalls({ set: turn.set, chatId, messageId: assistantMessage.id });
  return outcomes;
}

// ── Repeated failures ───────────────────────────────────────────────────────

/**
 * A model that meets an error sometimes sends the identical call again, round
 * after round, until the cap. A failed call repeated verbatim in a later round
 * of the same turn gets its result marked as such, so the model reads that
 * retrying unchanged cannot work.
 */
function createRepeatWatch() {
  const failed = new Set<string>();
  return {
    check(convo: ModelMessage[], outcomes: ToolCallOutcome[]): ToolCallOutcome[] {
      const failedNow: string[] = [];
      const checked = outcomes.map((outcome) => {
        const result = parseResult(outcome.content);
        if (!result || result.ok !== false) return outcome;
        const name = outcome.call.function.name;
        const key = `${name}\u0000${canonicalArguments(outcome.call.function.arguments)}`;
        failedNow.push(key);
        if (!failed.has(key)) return outcome;
        const content = JSON.stringify({
          ...result,
          repeated: `This call is identical to one that already failed this turn. Change what the hint names, or stop calling ${name} this turn.`,
        });
        const message = convo.find(
          (entry) => entry.role === 'tool' && entry.tool_call_id === outcome.call.id,
        );
        if (message) message.content = content;
        return { ...outcome, content };
      });
      for (const key of failedNow) failed.add(key);
      return checked;
    },
  };
}

function parseResult(content: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(content);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Arguments compared by value, so key order and whitespace do not hide a repeat. */
function canonicalArguments(raw: string | undefined): string {
  const sortKeys = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  };
  try {
    return JSON.stringify(sortKeys(JSON.parse(raw || '{}')));
  } catch {
    return (raw ?? '').trim();
  }
}

// ── Replay ──────────────────────────────────────────────────────────────────

/**
 * Collects the rounds later turns replay. Only calls to tools registered with
 * `replay: true` are kept; the text of a round with none of them joins the next
 * kept round, so the stored texts always read, in order, as a prefix of the
 * message content.
 */
function createReplayRecorder() {
  const rounds: MessageToolRound[] = [];
  let carried: string[] = [];
  return {
    record(text: string, outcomes: ToolCallOutcome[]) {
      const calls = outcomes
        .filter((outcome) => isReplayTool(outcome.call.function.name))
        .map(toReplayCall);
      if (calls.length === 0) {
        if (text) carried.push(text);
        return;
      }
      rounds.push({ text: [...carried, text].filter(Boolean).join('\n\n'), calls });
      carried = [];
    },
    rounds: () => rounds.slice(),
  };
}

function toReplayCall(outcome: ToolCallOutcome): MessageToolRoundCall {
  const call: ToolCall = outcome.call;
  return {
    id: call.id,
    name: call.function.name,
    arguments: outcome.replay?.arguments
      ? JSON.stringify(outcome.replay.arguments)
      : call.function.arguments || '{}',
    result: outcome.replay?.result ? JSON.stringify(outcome.replay.result) : outcome.content,
  };
}

/** Kept on the message as the loop goes, so a checkpoint or a stop keeps them too. */
function storeToolRounds(session: TurnSession, rounds: MessageToolRound[]): void {
  if (rounds.length === 0) return;
  const { turn, chatId, assistantMessage } = session.opts;
  turn.set((store) => {
    const result = updateMessageById(store, chatId, assistantMessage.id, (msg) => ({
      ...msg,
      toolRounds: rounds,
    }));
    return result ?? {};
  });
}

// ── Errors ──────────────────────────────────────────────────────────────────

const STREAM_ERROR = Symbol('agentLoopStreamError');

/**
 * Tags errors a stream already reported through its onError, so the loop does
 * not report a stop twice (the UI callbacks persist and notify on onError).
 */
function markStreamErrors(callbacks: { onError?: (error: Error) => void }) {
  let reported = false;
  const forward = callbacks.onError;
  callbacks.onError = (error) => {
    reported = true;
    forward?.(error);
  };
  return (error: unknown) => {
    if (reported && error && typeof error === 'object') {
      (error as Record<symbol, unknown>)[STREAM_ERROR] = true;
    }
    return error;
  };
}

function isStreamError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    (error as Record<symbol, unknown>)[STREAM_ERROR] === true
  );
}

function abortError(): Error {
  const error = new Error('The turn was stopped.');
  error.name = 'AbortError';
  return error;
}
