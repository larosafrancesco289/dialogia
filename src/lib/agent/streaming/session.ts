// Module: agent/streaming/session
// Responsibility: The state a streaming turn carries between rounds, and the
// helpers both turn loops (the default loop, which clears a round's text when
// it calls tools, and the visible agent loop) share: opening the session,
// scheduling tools, pre-logging calls, the UI callbacks, a failed turn's
// cleanup, and the turn's result.

import {
  createMessageStreamCallbacks,
  type MessageStreamCallbacks,
} from '@/lib/agent/streamHandlers';
import { isToolCallingSupported } from '@/lib/models';
import { logger } from '@/lib/logger';
import {
  clearTurnController,
  removeOrphanPendingToolCalls,
  settlePendingToolCalls,
  startToolCallLogEntry,
} from '@/lib/turns/runtime';
import { TOOL_CALL_STOPPED } from '@/lib/constants';
import { getToolLogCategory } from '@/lib/tools';
import { formatSourcesBlock } from '@/lib/search';
import { combineSystem } from '@/lib/agent/system';
import { DEFAULT_BASE_SYSTEM } from '@/lib/settings/baseSystem';
import { shouldAppendSources } from '@/lib/agent/policy';
import { loadModuleRuntimes } from '@/lib/modules';
import { derivePlanningContext } from '@/lib/agent/planning/context';
import { schedulePlanningRound } from '@/lib/agent/planning/schedule';
import { getMessagesForChat } from '@/lib/messages/indexing';
import { buildSystemMessage } from '@/lib/agent/cache';
import { resolveModelTransportKind } from '@/lib/providers';
import { anthropicBindsThinkingToPrefix } from '@/lib/anthropic/shared';
import { withoutThinking } from '@/lib/anthropic/messages';
import type {
  ModelMessage,
  PlanTurnResult,
  StreamFinalOptions,
  ToolCall,
  ToolDefinition,
  TurnLoopMode,
} from '@/lib/agent/types';
import type { ToolGate } from '@/lib/agent/planning/types';
import { createPlanningExecutionState } from '@/lib/agent/planning/types';
import type { PlanningExecutionState } from '@/lib/agent/planning/types';
import type { ToolCallDelta } from '@/lib/transport/types';
import { createStreamCallContext, type StreamCallContext } from '@/lib/agent/streaming/streamCall';
import { t } from '@/lib/i18n';

export type StreamingTurnOptions = StreamFinalOptions & {
  userContent: string;
  combinedSystem?: string;
  /** 'agent' streams every round visibly into one reply; see `agentLoop.ts`. */
  loop?: TurnLoopMode;
  /** The turn's tools read again between agent-loop rounds (`TurnComposition.refreshTools`). */
  refreshTools?: () => ToolDefinition[];
  onPlanResult?: (plan: PlanTurnResult) => void;
};

export type StreamingTurnResult = PlanTurnResult;

/** Everything a turn accumulates between rounds. */
export type TurnSession = {
  opts: StreamingTurnOptions;
  call: StreamCallContext;
  /** Tools the model may call this turn; undefined when it cannot call any. */
  tools?: ToolDefinition[];
  gate: ToolGate;
  convo: ModelMessage[];
  state: PlanningExecutionState;
  searchEnabled: boolean;
  searchProvider: string;
  /** Anthropic reads tool results without a nudge; other transports need one. */
  appendToolFollowUp: boolean;
  preLoggedToolIndices: Set<number>;
  /** The model rejects thinking sent back after the system prompt or tools changed. */
  bindsThinking: boolean;
  /** The system prompt and tools the turn's last request sent, while that matters. */
  thinkingPrefix?: string;
};

export async function openSession(opts: StreamingTurnOptions): Promise<TurnSession> {
  await loadModuleRuntimes();
  const { chat, chatId, turn, settings, toolDefinition, combinedSystem } = opts;
  const storeState = turn.get?.();

  const { toolDefinitions, gate } = derivePlanningContext({
    chat,
    messagesForChat: storeState ? getMessagesForChat(storeState, chatId) : [],
    ui: storeState?.ui,
    toolDefinition,
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
    state: createPlanningExecutionState(),
    searchEnabled: settings.searchEnabled,
    searchProvider: settings.searchProvider || 'openrouter',
    appendToolFollowUp: resolveModelTransportKind(settings.modelId, modelMeta) !== 'anthropic',
    preLoggedToolIndices: new Set(),
    bindsThinking: anthropicBindsThinkingToPrefix(settings.modelId),
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

/**
 * Offers the turn's tools as they stand after a round's calls ran, when the
 * turn can read them again; otherwise leaves them as they are. A request that
 * carries tool calls must still define tools, so an empty list changes nothing.
 */
export function refreshSessionTools(session: TurnSession): void {
  const next = session.opts.refreshTools?.();
  if (!next || !session.tools) return;
  const offered = next.filter((def) => {
    const name = def.function?.name;
    return !!name && session.gate.isAllowed(name);
  });
  if (offered.length) session.tools = offered;
}

/**
 * Takes the turn's thinking out of the conversation when this round's system
 * prompt or tools differ from the last round's. On models that bind a thinking
 * block to everything sent before it, sending one back after such a change
 * fails the request; leaving every earlier block out is allowed, and costs
 * only that reasoning. A tool set that follows the turn's progress (the
 * tutor's) and sources added to the system prompt after a search both change
 * mid-turn. Call it before building the round's request; once dropped, the
 * thinking stays out.
 */
export function forgetStaleThinking(
  session: TurnSession,
  messages: ModelMessage[],
  tools: ToolDefinition[] | undefined,
): void {
  if (!session.bindsThinking) return;
  const prefix = JSON.stringify([systemTexts(messages), tools ?? []]);
  const changed = session.thinkingPrefix !== undefined && session.thinkingPrefix !== prefix;
  session.thinkingPrefix = prefix;
  if (!changed) return;
  for (const message of session.convo) {
    if (message.role !== 'assistant' || message.reasoning_details === undefined) continue;
    const kept = withoutThinking(message.reasoning_details);
    if (kept === undefined) delete message.reasoning_details;
    else message.reasoning_details = kept;
  }
}

function systemTexts(messages: ModelMessage[]): string[] {
  return messages.flatMap((message) => {
    if (message.role !== 'system') return [];
    if (typeof message.content === 'string') return [message.content];
    return message.content.map((block) => (block.type === 'text' ? block.text : ''));
  });
}

/**
 * The round's calls that may run, in order. Only a tool the round offered may
 * run: the registry holds every tool, so a provider that returns a call to one
 * the turn withheld (memory switched off, say) must not reach it.
 */
export function scheduleTools(session: TurnSession, toolCalls: ToolCall[]): ToolCall[] {
  const offered = offeredToolNames(session);
  return schedulePlanningRound({
    toolCalls: toolCalls.filter((call) => offered.has(call.function?.name)),
    gate: session.gate,
    usedContentTool: session.state.usedContentTool,
    searchEnabled: session.searchEnabled,
    searchProvider: session.searchProvider,
    toolsUsedThisTurn: session.state.toolsUsedThisTurn,
  });
}

/** The names of the tools the current round offers. */
export function offeredToolNames(session: TurnSession): Set<string | undefined> {
  return new Set(session.tools?.map((def) => def.function?.name));
}

/** Shows a tool call as pending the moment its name arrives, before its arguments finish streaming. */
export function preLogToolCalls(session: TurnSession, deltas: ToolCallDelta[]): void {
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

/** The system prompt for rounds after tools: the turn's system plus any search sources. */
export function finalSystemFor(session: TurnSession): string {
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

export function createUiCallbacks(session: TurnSession): MessageStreamCallbacks {
  const { chatId, assistantMessage, turn, settings, controller } = session.opts;
  return createMessageStreamCallbacks(
    {
      chatId,
      assistantMessage,
      set: turn.set,
      get: turn.get,
      autoReasoningEligible: session.call.disableReasoning,
      modelIdUsed: settings.modelId,
      clearController: () => clearTurnController(chatId, controller),
      persistMessage: turn.persistMessage,
    },
    { startedAt: performance.now() },
  );
}

function buildPlanResult(session: TurnSession, finalSystem: string): PlanTurnResult {
  const { state } = session;
  return {
    finalSystem,
    usedContentTool: state.usedContentTool,
    hasSearchResults: shouldAppendSources(state.aggregatedResults),
  };
}

export function emitPlanResult(session: TurnSession, finalSystem: string): PlanTurnResult {
  const plan = buildPlanResult(session, finalSystem);
  session.opts.onPlanResult?.(plan);
  return plan;
}

export function buildResult(session: TurnSession, finalSystem: string): StreamingTurnResult {
  return buildPlanResult(session, finalSystem);
}

// ── Errors ──────────────────────────────────────────────────────────────────

const STREAM_ERROR = Symbol('streamError');

/**
 * Tags errors a stream already reported through its onError, so the loop does
 * not report a stop twice (the UI callbacks persist and notify on onError).
 */
export function markStreamErrors(callbacks: { onError?: (error: Error) => void }) {
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

export function abortError(): Error {
  const error = new Error('The turn was stopped.');
  error.name = 'AbortError';
  return error;
}

/**
 * A stream that fails or is stopped has already told the UI callbacks, which
 * persist what streamed; anything else (a stop between rounds, a tool that
 * threw) is reported to them here, so the reply flushes and its checkpoint
 * timer stops. Either way the ledger must not keep spinning.
 */
export async function settleFailedTurn(
  session: TurnSession,
  ui: MessageStreamCallbacks,
  error: unknown,
): Promise<void> {
  const { turn, chatId, assistantMessage, controller } = session.opts;
  const messageId = assistantMessage.id;
  removeOrphanPendingToolCalls({ set: turn.set, chatId, messageId });
  settlePendingToolCalls({
    set: turn.set,
    chatId,
    messageId,
    error: controller.signal.aborted ? TOOL_CALL_STOPPED : t('activity.turnFailed'),
  });
  if (!isStreamError(error)) {
    ui.onError?.(
      controller.signal.aborted
        ? abortError()
        : error instanceof Error
          ? error
          : new Error(String(error)),
    );
    return;
  }
  // The stream's own onError saved the message before the ledger settled.
  const current = turn.get().messagesById[messageId];
  if (current) await turn.persistMessage(current).catch(() => undefined);
}
