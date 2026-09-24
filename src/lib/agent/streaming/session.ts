// Module: agent/streaming/session
// Responsibility: The state a streaming turn carries between rounds, and the
// helpers both turn loops (the default draft-and-answer loop and the visible
// agent loop) share: opening the session, scheduling tools, pre-logging calls,
// the UI callbacks, and the turn's result.

import {
  createMessageStreamCallbacks,
  type MessageStreamCallbacks,
} from '@/lib/agent/streamHandlers';
import { isToolCallingSupported } from '@/lib/models';
import { logger } from '@/lib/logger';
import { clearTurnController, startToolCallLogEntry } from '@/lib/turns/runtime';
import { getToolLogCategory } from '@/lib/tools';
import { formatSourcesBlock } from '@/lib/search';
import { combineSystem } from '@/lib/agent/system';
import { DEFAULT_BASE_SYSTEM } from '@/lib/agent/prompts/baseSystem';
import { shouldAppendSources } from '@/lib/agent/policy';
import { loadModuleRuntimes } from '@/lib/modules';
import { derivePlanningContext } from '@/lib/agent/planning/context';
import { schedulePlanningRound } from '@/lib/agent/planning/schedule';
import { getMessagesForChat } from '@/lib/messages/indexing';
import { buildSystemMessage } from '@/lib/agent/cache';
import { resolveModelTransportKind } from '@/lib/providers';
import type {
  ModelMessage,
  PlanTurnResult,
  PlanTurnSideEffect,
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

export type StreamingTurnOptions = StreamFinalOptions & {
  userContent: string;
  combinedSystem?: string;
  /** 'agent' streams every round visibly into one reply; see `agentLoop.ts`. */
  loop?: TurnLoopMode;
  /** The turn's tools read again between agent-loop rounds (`TurnComposition.refreshTools`). */
  refreshTools?: () => ToolDefinition[];
  onPlanResult?: (plan: PlanTurnResult) => void;
  onPlanSideEffects?: (effects: PlanTurnSideEffect[]) => void;
};

export type StreamingTurnResult = PlanTurnResult & {
  sideEffects: PlanTurnSideEffect[];
  shortCircuited?: boolean;
};

/** Everything a turn accumulates between rounds. */
export type TurnSession = {
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

export function scheduleTools(session: TurnSession, toolCalls: ToolCall[]): ToolCall[] {
  return schedulePlanningRound({
    toolCalls,
    gate: session.gate,
    usedContentTool: session.state.usedContentTool,
    searchEnabled: session.searchEnabled,
    searchProvider: session.searchProvider,
    toolsUsedThisTurn: session.state.toolsUsedThisTurn,
  });
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

/** The system prompt for the closing stream: the turn's system plus any search sources. */
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

export function buildResult(
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
