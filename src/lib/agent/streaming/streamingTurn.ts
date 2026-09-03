// Module: agent/streaming/streamingTurn
// Responsibility: A turn that streams and calls tools in one loop. The first
// round paints the UI as it streams; when the model asks for tools, the draft is
// cleared, the tools run, and the model streams again, up to MAX_PLANNING_ROUNDS,
// before a final tool-free stream produces the visible answer.

import {
  createMessageStreamCallbacks,
  type MessageStreamCallbacks,
} from '@/lib/agent/streamHandlers';
import { isToolCallingSupported } from '@/lib/models';
import { logger } from '@/lib/logger';
import {
  clearTurnController,
  removeOrphanPendingToolCalls,
  startToolCallLogEntry,
} from '@/lib/turns/runtime';
import { getToolLogCategory } from '@/lib/tools';
import { formatSourcesBlock } from '@/lib/search';
import { combineSystem } from '@/lib/agent/system';
import { DEFAULT_BASE_SYSTEM } from '@/lib/agent/prompts/baseSystem';
import { MAX_PLANNING_ROUNDS, shouldAppendSources } from '@/lib/agent/policy';
import { loadModuleRuntimes } from '@/lib/modules';
import { derivePlanningContext } from '@/lib/agent/planning/context';
import { schedulePlanningRound } from '@/lib/agent/planning/schedule';
import { applyToolExecutions } from '@/lib/agent/planning/apply';
import { followUpPrompt } from '@/lib/agent/prompts/followUp';
import { getMessagesForChat } from '@/lib/messages/indexing';
import { updateMessageById } from '@/lib/messages/updateMessageById';
import { applyCacheBreakpoints, buildSystemMessage } from '@/lib/agent/cache';
import { resolveModelTransportKind } from '@/lib/providers';
import type {
  ModelMessage,
  PlanTurnResult,
  PlanTurnSideEffect,
  StreamFinalOptions,
  ToolCall,
  ToolDefinition,
} from '@/lib/agent/types';
import type { ToolGate } from '@/lib/agent/planning/types';
import { createPlanningExecutionState } from '@/lib/agent/planning/types';
import type { PlanningExecutionState } from '@/lib/agent/planning/types';
import { readContentModuleResult } from '@/lib/agent/planning/moduleResult';
import type { ToolCallDelta } from '@/lib/transport/types';
import { chooseFinalDraft, looksIncomplete } from '@/lib/agent/streaming/draft';
import {
  captureRound,
  createStreamCallContext,
  executeStreamCall,
  roundWantsTools,
  type RoundCapture,
  type StreamCallContext,
} from '@/lib/agent/streaming/streamCall';

export type StreamingTurnOptions = StreamFinalOptions & {
  userContent: string;
  combinedSystem?: string;
  onPlanResult?: (plan: PlanTurnResult) => void;
  onPlanSideEffects?: (effects: PlanTurnSideEffect[]) => void;
  shouldShortCircuit?: (plan: PlanTurnResult) => boolean;
};

export type StreamingTurnResult = PlanTurnResult & {
  sideEffects: PlanTurnSideEffect[];
  shortCircuited?: boolean;
};

/** Everything a turn accumulates between rounds. */
type TurnSession = {
  opts: StreamingTurnOptions;
  call: StreamCallContext;
  /** Tools the model may call this turn; undefined when it cannot call any. */
  tools?: ToolDefinition[];
  gate: ToolGate;
  convo: ModelMessage[];
  state: PlanningExecutionState;
  sideEffects: PlanTurnSideEffect[];
  /** Text the model wrote before tool rounds, kept as a candidate final answer. */
  draft: string;
  searchEnabled: boolean;
  searchProvider: string;
  /** Anthropic reads tool results without a nudge; other transports need one. */
  appendToolFollowUp: boolean;
  preLoggedToolIndices: Set<number>;
};

export async function executeStreamingTurn(
  opts: StreamingTurnOptions,
): Promise<StreamingTurnResult> {
  const session = await openSession(opts);
  if (!session.tools) return streamWithoutTools(session);

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
    const plan = emitPlanResult(session, finalSystem);
    if (opts.shouldShortCircuit?.(plan)) {
      finalizeShortCircuit(session, ui, round.content);
      return buildResult(session, finalSystem, true);
    }
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

async function openSession(opts: StreamingTurnOptions): Promise<TurnSession> {
  await loadModuleRuntimes();
  const { chat, chatId, turn, settings, toolDefinition, combinedSystem } = opts;
  const storeState = turn.get?.();
  const currentPlan = chat.settings.features.tutor?.learningPlan;

  const { toolDefinitions, gate } = derivePlanningContext({
    chat,
    messagesForChat: storeState ? getMessagesForChat(storeState, chatId) : [],
    ui: storeState?.ui,
    toolDefinition,
    currentPlan,
  });

  const modelMeta = settings.modelMeta ?? turn.modelIndex.get(settings.modelId);
  const caps = settings.caps ?? turn.modelIndex.caps(settings.modelId);
  const planningSystem = buildSystemMessage({
    combinedSystem,
    systemStable: opts.systemStable,
    systemDynamic: opts.systemDynamic,
  });

  return {
    opts,
    call: createStreamCallContext(opts, caps),
    tools: usableTools(settings.modelId, modelMeta, toolDefinitions),
    gate,
    convo: planningSystem
      ? [planningSystem, ...opts.messages.filter((m) => m.role !== 'system')]
      : opts.messages.slice(),
    state: createPlanningExecutionState({
      moduleState: currentPlan ? { contentModule: { currentPlan } } : {},
    }),
    sideEffects: [],
    draft: '',
    searchEnabled: settings.searchEnabled,
    searchProvider: settings.searchProvider || 'openrouter',
    appendToolFollowUp: resolveModelTransportKind(settings.modelId, modelMeta) !== 'anthropic',
    preLoggedToolIndices: new Set(),
  };
}

/**
 * The gated tool list, or undefined when this model cannot call tools. A model
 * with no metadata at all is assumed capable: dropping the tools silently would
 * hide the tutor from every user-configured endpoint.
 */
function usableTools(
  modelId: string,
  modelMeta: ReturnType<StreamFinalOptions['turn']['modelIndex']['get']>,
  tools: ToolDefinition[] | undefined,
): ToolDefinition[] | undefined {
  if (!Array.isArray(tools) || tools.length === 0) return undefined;
  if (isToolCallingSupported(modelMeta)) return tools;
  if (!modelMeta) {
    logger.warn(
      `Tool calling check failed for ${modelId} (no modelMeta). ` +
        `Assuming tool support since ${tools.length} tools are defined.`,
    );
    return tools;
  }
  logger.warn(
    `Tool calling not supported for ${modelId} per metadata. ` +
      `${tools.length} tool definitions will be dropped.`,
  );
  return undefined;
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

  if (
    session.opts.shouldShortCircuit?.(plan) ||
    (draftStands && (toolsAddedNothing || everyToolFailed))
  ) {
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

function scheduleTools(session: TurnSession, toolCalls: ToolCall[]): ToolCall[] {
  return schedulePlanningRound({
    toolCalls,
    gate: session.gate,
    usedContentTool: session.state.usedContentTool,
    searchEnabled: session.searchEnabled,
    searchProvider: session.searchProvider,
    toolsUsedThisTurn: session.state.toolsUsedThisTurn,
  });
}

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

/** Shows a tool call as pending the moment its name arrives, before its arguments finish streaming. */
function preLogToolCalls(session: TurnSession, deltas: ToolCallDelta[]): void {
  const { turn, chatId, assistantMessage } = session.opts;
  for (const delta of deltas) {
    if (session.preLoggedToolIndices.has(delta.index)) continue;
    const name = delta.function?.name;
    if (!name) continue;
    session.preLoggedToolIndices.add(delta.index);
    startToolCallLogEntry({
      set: turn.set,
      chatId,
      messageId: assistantMessage.id,
      name,
      input: {},
      category: getToolLogCategory(name),
    });
  }
}

// ── Message shaping ─────────────────────────────────────────────────────────

/** The system prompt for the closing stream: the turn's system plus any search sources. */
function finalSystemFor(session: TurnSession): string {
  const { combinedSystem, settings } = session.opts;
  const baseSystem = combinedSystem?.trim()
    ? combinedSystem
    : settings.system?.trim()
      ? settings.system
      : DEFAULT_BASE_SYSTEM;
  const results = session.state.aggregatedResults;
  const sources = shouldAppendSources(results)
    ? formatSourcesBlock(results, session.searchProvider)
    : undefined;
  return combineSystem(baseSystem, [], sources) ?? baseSystem;
}

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

function createUiCallbacks(session: TurnSession): MessageStreamCallbacks {
  const { chatId, assistantMessage, turn, startBuffered, settings, controller } = session.opts;
  return createMessageStreamCallbacks(
    {
      chatId,
      assistantMessage,
      set: turn.set,
      get: turn.get,
      startBuffered,
      autoReasoningEligible: session.call.disableReasoning,
      modelIdUsed: settings.modelId,
      clearController: () => clearTurnController(chatId, controller),
      persistMessage: turn.persistMessage,
    },
    { startedAt: performance.now() },
  );
}

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

// ── Results ─────────────────────────────────────────────────────────────────

function buildPlanResult(session: TurnSession, finalSystem: string): PlanTurnResult {
  const { state } = session;
  const moduleResult = readContentModuleResult(state);
  return {
    finalSystem,
    usedContentTool: state.usedContentTool,
    hasSearchResults: shouldAppendSources(state.aggregatedResults),
    learnerModel: moduleResult.learnerModel,
    planUpdates: moduleResult.planUpdates,
    updatedPlan: moduleResult.updatedPlan,
    learnerModelDebug: moduleResult.learnerModelDebug,
  };
}

function emitPlanResult(session: TurnSession, finalSystem: string): PlanTurnResult {
  const plan = buildPlanResult(session, finalSystem);
  session.opts.onPlanResult?.(plan);
  return plan;
}

function buildResult(
  session: TurnSession,
  finalSystem: string,
  shortCircuited = false,
): StreamingTurnResult {
  return {
    ...buildPlanResult(session, finalSystem),
    sideEffects: session.sideEffects,
    shortCircuited,
  };
}
