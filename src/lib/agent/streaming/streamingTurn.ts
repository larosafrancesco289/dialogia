// Module: agent/streaming/streamingTurn
// Responsibility: A turn that streams and calls tools in one loop. The first
// round paints the UI as it streams; when the model asks for tools, the draft is
// cleared, the tools run, and the model streams again, up to MAX_PLANNING_ROUNDS,
// before a final tool-free stream produces the visible answer. A module that
// asks for `loop: 'agent'` gets the visible agent loop in `agentLoop.ts` instead.

import type { MessageStreamCallbacks } from '@/lib/agent/streamHandlers';
import { removeOrphanPendingToolCalls } from '@/lib/turns/runtime';
import { MAX_PLANNING_ROUNDS } from '@/lib/agent/policy';
import { applyToolExecutions } from '@/lib/agent/planning/apply';
import { followUpPrompt } from '@/lib/agent/prompts/followUp';
import { updateMessageById } from '@/lib/messages/updateMessageById';
import { applyCacheBreakpoints, buildSystemMessage } from '@/lib/agent/cache';
import type { ModelMessage, PlanTurnSideEffect, ToolCall } from '@/lib/agent/types';
import { chooseFinalDraft, looksIncomplete } from '@/lib/agent/streaming/draft';
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
  let round = await streamFirstRound(session, ui);
  if (!roundWantsTools(round) && shouldRetryFirstRound(session, round)) {
    round = await streamFirstRound(session, ui);
  }
  if (!roundWantsTools(round)) {
    completeVisibleRound(session, ui, round);
    return buildResult(session, finalSystemFor(session));
  }

  let scheduled = scheduleTools(session, round.toolCalls);
  if (scheduled.length === 0) {
    const finalSystem = finalSystemFor(session);
    emitPlanResult(session, finalSystem);
    ui.onDone?.(round.content, { finishReason: round.finishReason });
    return buildResult(session, finalSystem);
  }

  clearVisibleDraft(session, ui);
  await runToolRound(session, {
    round: 1,
    content: round.content,
    scheduled,
    reasoningDetails: round.reasoningDetails,
    reasoningText: '',
    applySideEffect: false,
  });

  let rounds = 1;
  while (rounds < MAX_PLANNING_ROUNDS) {
    const next = await streamSilentRound(session, rounds + 1);
    if (!roundWantsTools(next)) {
      appendActivityReasoning(session, next.reasoningText, rounds + 1);
      break;
    }
    scheduled = scheduleTools(session, next.toolCalls);
    if (scheduled.length === 0) break;
    await runToolRound(session, {
      round: rounds + 1,
      content: next.content,
      scheduled,
      reasoningDetails: next.reasoningDetails,
      reasoningText: next.reasoningText,
    });
    rounds += 1;
  }

  return streamFinalAnswer(session, ui, rounds);
}

// ── Rounds ──────────────────────────────────────────────────────────────────

/** A single visible stream; the whole turn when no tools are available. */
async function streamWithoutTools(session: TurnSession): Promise<StreamingTurnResult> {
  const finalSystem = finalSystemFor(session);
  emitPlanResult(session, finalSystem);
  await executeStreamCall(session.call, {
    messages: applyCacheBreakpoints(finalMessagesFor(session, finalSystem)),
    tools: undefined,
    toolChoice: undefined,
    callbacks: createUiCallbacks(session),
  });
  return buildResult(session, finalSystem);
}

/** Streams to the UI with tools offered. Runs again, once, for a retry. */
async function streamFirstRound(
  session: TurnSession,
  ui: MessageStreamCallbacks,
): Promise<RoundCapture> {
  const { callbacks, round } = captureRound({
    forward: ui,
    onToolCallDelta: (deltas) => preLogToolCalls(session, deltas),
  });
  await executeStreamCall(session.call, {
    messages: applyCacheBreakpoints(session.convo),
    tools: session.tools,
    toolChoice: 'auto',
    callbacks,
    round: 0,
  });
  return round;
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

/** Ends a first round that produced an answer rather than tool calls. */
function completeVisibleRound(
  session: TurnSession,
  ui: MessageStreamCallbacks,
  round: RoundCapture,
): void {
  emitPlanResult(session, finalSystemFor(session));
  ui.onDone?.(round.full, round.extras);
}

/** Streams with tools offered and nothing painted; used between tool rounds. */
async function streamSilentRound(session: TurnSession, round: number): Promise<RoundCapture> {
  const capture = captureRound({
    onToolCallDelta: (deltas) => preLogToolCalls(session, deltas),
  });
  await executeStreamCall(session.call, {
    messages: applyCacheBreakpoints(session.convo),
    tools: session.tools,
    toolChoice: 'auto',
    callbacks: capture.callbacks,
    round,
  });
  return capture.round;
}

/**
 * The closing stream, with tools withheld, unless the draft written before the
 * tool rounds already reads as the answer. A finished draft is kept when the
 * tools added nothing the model has to rewrite for (no search results, or
 * every tool failed), which spares the user a second visible rewrite.
 */
async function streamFinalAnswer(
  session: TurnSession,
  ui: MessageStreamCallbacks,
  rounds: number,
): Promise<StreamingTurnResult> {
  const finalSystem = finalSystemFor(session);
  const plan = emitPlanResult(session, finalSystem);
  const { state, draft } = session;
  const draftStands = draft.trim().length > 0 && !looksIncomplete(draft);
  const toolsAddedNothing = !plan.hasSearchResults;
  const everyToolFailed =
    state.failedToolCallsThisTurn > 0 && state.successfulToolCallsThisTurn === 0;

  if (draftStands && (toolsAddedNothing || everyToolFailed)) {
    finalizeShortCircuit(session, ui, draft);
    return buildResult(session, finalSystem, true);
  }

  clearVisibleDraft(session);
  await executeStreamCall(session.call, {
    messages: applyCacheBreakpoints(finalMessagesFor(session, finalSystem)),
    tools: session.tools,
    toolChoice: 'none',
    callbacks: createUiCallbacks(session),
    round: rounds + 1,
  });
  return buildResult(session, finalSystem);
}

// ── Tool rounds ─────────────────────────────────────────────────────────────

/** Records the model's tool request in the conversation, runs the tools, and appends their results. */
async function runToolRound(
  session: TurnSession,
  args: {
    round: number;
    content: string;
    scheduled: ToolCall[];
    reasoningDetails?: unknown;
    reasoningText: string;
    applySideEffect?: boolean;
  },
): Promise<void> {
  const { opts, convo } = session;
  const { chat, chatId, assistantMessage, userContent, controller, turn } = opts;
  const content = args.content.trim();

  if (content) session.draft = session.draft.trim() ? `${session.draft}\n\n${content}` : content;

  convo.push({
    role: 'assistant',
    content: args.content || '',
    tool_calls: args.scheduled,
    ...(args.reasoningDetails !== undefined ? { reasoning_details: args.reasoningDetails } : {}),
  });
  appendActivityReasoning(session, args.reasoningText, args.round);

  if (content) {
    emitSideEffect(
      session,
      {
        type: 'append_planning_content',
        chatId,
        messageId: assistantMessage.id,
        content: args.content,
      },
      args.applySideEffect ?? true,
    );
  }

  session.state = await applyToolExecutions({
    scheduled: args.scheduled,
    round: args.round,
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

  // Pre-logged entries for calls the scheduler dropped would stay "pending"
  // in the ledger forever; executed calls have resolved by now.
  removeOrphanPendingToolCalls({ set: turn.set, chatId, messageId: assistantMessage.id });

  if (session.appendToolFollowUp) {
    convo.push({
      role: 'user',
      content: followUpPrompt({
        searchEnabled: session.searchEnabled,
        searchProvider: session.searchProvider,
      }),
    });
  }
}

// ── Message shaping ─────────────────────────────────────────────────────────

function finalMessagesFor(session: TurnSession, finalSystem: string): ModelMessage[] {
  const system = buildSystemMessage({
    combinedSystem: finalSystem,
    systemStable: session.opts.systemStable,
    systemDynamic: session.opts.systemDynamic,
  });
  // buildSystemMessage always returns a message when combinedSystem is set.
  return [system!, ...session.convo.filter((m) => m.role !== 'system')];
}

// ── UI and store effects ────────────────────────────────────────────────────

/** Ends the turn without a closing stream, keeping the best of the visible text and the draft. */
function finalizeShortCircuit(
  session: TurnSession,
  ui: MessageStreamCallbacks,
  fallback: string,
): void {
  const { turn, assistantMessage } = session.opts;
  const current = turn.get?.()?.messagesById?.[assistantMessage.id];
  const visible = typeof current?.content === 'string' ? current.content : '';
  ui.onDone?.(chooseFinalDraft(visible, fallback), { finishReason: 'tool_calls' });
}

function clearVisibleDraft(session: TurnSession, ui?: MessageStreamCallbacks): void {
  const { turn, chatId, assistantMessage } = session.opts;
  ui?.discardPendingText();
  turn.set((store) => {
    const result = updateMessageById(store, chatId, assistantMessage.id, (msg) =>
      msg.content ? { ...msg, content: '' } : msg,
    );
    return result ?? {};
  });
}

function appendActivityReasoning(session: TurnSession, text: string, round?: number): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  const { turn, chatId, assistantMessage } = session.opts;
  turn.set((store) => {
    const result = updateMessageById(store, chatId, assistantMessage.id, (msg) => {
      const activity = Array.isArray(msg.activity) ? msg.activity : [];
      return {
        ...msg,
        activity: [
          ...activity,
          {
            id: `${assistantMessage.id}-reasoning-${round ?? activity.length}-${Date.now()}`,
            type: 'reasoning' as const,
            text: trimmed,
            timestamp: Date.now(),
            status: 'done' as const,
            round,
          },
        ],
      };
    });
    return result ?? store;
  });
}

function emitSideEffect(session: TurnSession, effect: PlanTurnSideEffect, applyNow: boolean) {
  session.sideEffects.push(effect);
  if (applyNow) session.opts.onPlanSideEffects?.([effect]);
}
