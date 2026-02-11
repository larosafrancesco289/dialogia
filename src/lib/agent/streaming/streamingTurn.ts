// Module: agent/streaming/streamingTurn
// Responsibility: Unified streaming with inline tool execution for tutor/study mode.
// Replaces the two-phase plan+stream approach with a single streaming call.

import { getStreamChatCompletion } from '@/lib/agent/pipelineClient';
import { captureRequestDebug } from '@/lib/agent/debug';
import { createMessageStreamCallbacks } from '@/lib/agent/streamHandlers';
import { isToolCallingSupported } from '@/lib/models';
import { clearTurnController, startToolCallLogEntry } from '@/lib/turns/runtime';
import { getToolCategory } from '@/lib/tools/registry';
import { isReasoningRequested } from '@/lib/settings/generation';
import { shouldIncludeUsage } from '@/lib/api/normalizers';
import { formatSourcesBlock } from '@/lib/search';
import { combineSystem } from '@/lib/agent/system';
import { DEFAULT_BASE_SYSTEM } from '@/lib/agent/prompts/baseSystem';
import { MAX_PLANNING_ROUNDS, shouldAppendSources } from '@/lib/agent/policy';
import { derivePlanningContext } from '@/lib/agent/planning/context';
import { schedulePlanningRound } from '@/lib/agent/planning/schedule';
import { applyToolExecutions } from '@/lib/agent/planning/apply';
import { followUpPrompt } from '@/lib/agent/prompts/followUp';
import { getMessagesForChat } from '@/lib/messages/indexing';
import { applyCacheBreakpoints, buildSystemMessage } from '@/lib/agent/cache';
import type {
  ModelMessage,
  PlanTurnResult,
  PlanTurnSideEffect,
  StreamFinalOptions,
  ToolCall,
  ToolDefinition,
} from '@/lib/agent/types';
import type { PlanningExecutionState } from '@/lib/agent/planning/types';
import type { StreamCallbacks, StreamDoneExtras } from '@/lib/transport/types';

/** Returns true if the model response looks truncated or empty. */
function looksIncomplete(
  content: string,
  finishReason?: StreamDoneExtras['finishReason'],
): boolean {
  const trimmed = content.trim();
  if (!trimmed) return true;
  if (finishReason === 'length') return true;
  const fencedCodeBlocks = trimmed.match(/```/g);
  if (fencedCodeBlocks && fencedCodeBlocks.length % 2 === 1) return true;
  if (/[([{]$/.test(trimmed)) return true;
  if (/[,:;-]$/.test(trimmed)) return true;
  return false;
}

export type StreamingTurnOptions = StreamFinalOptions & {
  userContent: string;
  combinedSystem?: string;
  onPlanResult?: (plan: PlanTurnResult) => void;
  onPlanSideEffects?: (effects: PlanTurnSideEffect[]) => void;
  shouldShortCircuit?: (plan: PlanTurnResult) => boolean;
};

export type StreamingTurnResult = {
  finalSystem: string;
  usedTutorContentTool: boolean;
  hasSearchResults: boolean;
  learnerModel?: PlanTurnResult['learnerModel'];
  planUpdates?: PlanTurnResult['planUpdates'];
  updatedPlan?: PlanTurnResult['updatedPlan'];
  learnerModelDebug?: PlanTurnResult['learnerModelDebug'];
  sideEffects: PlanTurnSideEffect[];
  shortCircuited?: boolean;
};

type StreamingContext = {
  opts: StreamingTurnOptions;
  generation: StreamingTurnOptions['settings']['generation'];
  modalities: Array<'image' | 'text'> | undefined;
  disableReasoning: boolean;
  canImageOut: boolean;
  combinedPlugins: StreamingTurnOptions['plugins'];
};

type StreamCallParams = {
  messages: ModelMessage[];
  tools: ToolDefinition[] | undefined;
  toolChoice: 'auto' | 'none' | undefined;
  callbacks: StreamCallbacks;
};

/**
 * Helper to execute a streaming call with debug capture.
 * Consolidates the repeated captureRequestDebug + getStreamChatCompletion pattern.
 */
async function executeStreamCall(ctx: StreamingContext, params: StreamCallParams): Promise<void> {
  const { opts, generation, modalities, disableReasoning, canImageOut, combinedPlugins } = ctx;
  const { turn, settings, controller } = opts;

  captureRequestDebug({
    turn,
    messageId: opts.assistantMessage.id,
    modelId: settings.modelId,
    messages: params.messages,
    stream: true,
    includeUsage: shouldIncludeUsage(true),
    canImageOut,
    temperature: generation.temperature,
    topP: generation.topP,
    maxTokens: generation.maxTokens,
    reasoningEffort: generation.reasoningEffort,
    reasoningTokens: generation.reasoningTokens,
    tools: params.tools,
    toolChoice: params.toolChoice,
    providerSort: generation.providerSort,
    plugins: combinedPlugins,
  });

  await getStreamChatCompletion(opts.pipeline)({
    auth: turn.auth,
    model: settings.modelId,
    messages: params.messages,
    modalities,
    temperature: generation.temperature,
    topP: generation.topP,
    maxTokens: generation.maxTokens,
    reasoningEffort: generation.reasoningEffort,
    reasoningTokens: generation.reasoningTokens,
    disableReasoning,
    providerSort: generation.providerSort,
    signal: controller.signal,
    tools: params.tools,
    toolChoice: params.toolChoice,
    plugins: combinedPlugins,
    callbacks: params.callbacks,
  });
}

function buildResult(
  state: PlanningExecutionState,
  finalSystem: string,
  sideEffects: PlanTurnSideEffect[],
  shortCircuited = false,
): StreamingTurnResult {
  return {
    finalSystem,
    usedTutorContentTool: state.usedTutorContentTool,
    hasSearchResults: shouldAppendSources(state.aggregatedResults),
    learnerModel: state.learnerModel,
    planUpdates: state.planUpdates,
    updatedPlan: state.updatedPlan,
    learnerModelDebug: state.learnerModelDebug,
    sideEffects,
    shortCircuited,
  };
}

function buildPlanResult(state: PlanningExecutionState, finalSystem: string): PlanTurnResult {
  return {
    finalSystem,
    usedTutorContentTool: state.usedTutorContentTool,
    hasSearchResults: shouldAppendSources(state.aggregatedResults),
    learnerModel: state.learnerModel,
    planUpdates: state.planUpdates,
    updatedPlan: state.updatedPlan,
    learnerModelDebug: state.learnerModelDebug,
  };
}

/**
 * Execute a streaming turn with inline tool calling.
 * This replaces the two-phase plan+stream approach by:
 * 1. Streaming with toolChoice='auto' and UI callbacks connected
 * 2. If tool calls detected (finish_reason='tool_calls'), execute them without showing content
 * 3. Continue until no more tool calls, then final streaming shows the response
 *
 * When no tools are called, this is a SINGLE LLM call (vs 2 in the old approach).
 * When tools are called, this is N+1 streaming calls where N is the number of tool rounds.
 */
export async function executeStreamingTurn(
  opts: StreamingTurnOptions,
): Promise<StreamingTurnResult> {
  const {
    chat,
    chatId,
    assistantMessage,
    messages: baseMessages,
    controller,
    turn,
    settings,
    plugins,
    toolDefinition,
    startBuffered,
    userContent,
    combinedSystem,
    systemStable,
    systemDynamic,
    onPlanResult,
    onPlanSideEffects,
    shouldShortCircuit,
  } = opts;
  const { set, get, modelIndex, persistMessage } = turn;
  const storeState = get?.();
  const messagesForChat = storeState ? getMessagesForChat(storeState, chatId) : [];
  let currentPlan = chat.settings.features.tutor.learningPlan;
  const sideEffects: PlanTurnSideEffect[] = [];

  // Derive planning context for tool filtering
  const { planningToolDefinition, allowedTutorTools, toolPolicy, phase } = derivePlanningContext({
    chat,
    messagesForChat,
    ui: storeState?.ui,
    toolDefinition,
    currentPlan,
  });

  // Setup model capabilities
  const modelMeta = settings.modelMeta ?? modelIndex.get(settings.modelId);
  const caps = settings.caps ?? modelIndex.caps(settings.modelId);
  const canImageOut = caps.canImageOut;
  const supportsTools = isToolCallingSupported(modelMeta);
  const hasTools =
    supportsTools && Array.isArray(planningToolDefinition) && planningToolDefinition.length > 0;

  const combinedPlugins = Array.isArray(plugins) && plugins.length > 0 ? plugins : undefined;
  const generation = settings.generation;
  const disableReasoning = caps.canReason && !isReasoningRequested(generation);
  const searchEnabled = settings.searchEnabled;
  const searchProvider = settings.searchProvider || 'openrouter';
  const modalities = canImageOut ? (['image', 'text'] as Array<'image' | 'text'>) : undefined;

  // Streaming context for helper functions
  const ctx: StreamingContext = {
    opts,
    generation,
    modalities,
    disableReasoning,
    canImageOut,
    combinedPlugins,
  };

  // Initialize execution state
  let state: PlanningExecutionState = {
    aggregatedResults: [],
    usedTutorContentTool: false,
    learnerModel: undefined,
    planUpdates: undefined,
    updatedPlan: undefined,
    learnerModelDebug: undefined,
    currentPlan,
    toolsUsedThisTurn: 0,
    quizCallsThisTurn: 0,
  };

  const maxToolsPerTurn =
    toolPolicy.maxToolsPerTurn && Number.isFinite(toolPolicy.maxToolsPerTurn)
      ? Math.max(1, toolPolicy.maxToolsPerTurn)
      : Infinity;

  // Build initial messages with system prompt (multipart when stable/dynamic split available)
  const planningSystem = buildSystemMessage({ combinedSystem, systemStable, systemDynamic });
  const convo: ModelMessage[] = planningSystem
    ? [planningSystem, ...baseMessages.filter((m) => m.role !== 'system')]
    : baseMessages.slice();

  // Helper to build final system with search results
  const buildFinalSystem = (): string => {
    const baseSystem =
      combinedSystem && combinedSystem.trim()
        ? combinedSystem
        : settings.system && settings.system.trim()
          ? settings.system
          : DEFAULT_BASE_SYSTEM;
    const hasResults = shouldAppendSources(state.aggregatedResults);
    const sourcesAppendix = hasResults
      ? formatSourcesBlock(state.aggregatedResults, searchProvider)
      : undefined;
    return combineSystem(baseSystem, [], sourcesAppendix) ?? baseSystem;
  };

  const emitPlanResult = (finalSystem: string): PlanTurnResult => {
    const planResult = buildPlanResult(state, finalSystem);
    onPlanResult?.(planResult);
    return planResult;
  };

  const emitPlanSideEffect = (effect: PlanTurnSideEffect, applyNow = true) => {
    sideEffects.push(effect);
    if (applyNow) {
      onPlanSideEffects?.([effect]);
    }
  };

  // Create UI-connected callbacks
  const createUiCallbacks = (startedAt: number): StreamCallbacks =>
    createMessageStreamCallbacks(
      {
        chatId,
        assistantMessage,
        set,
        get,
        startBuffered,
        autoReasoningEligible: disableReasoning,
        modelIdUsed: settings.modelId,
        clearController: () => clearTurnController(chatId, controller),
        persistMessage,
      },
      { startedAt },
    );

  // Track which tool call indices we've already pre-logged
  const preLoggedToolIndices = new Set<number>();

  // Pre-log a tool call as pending for immediate UI feedback
  const preLogToolCall = (name: string) => {
    const category = getToolCategory(name);
    startToolCallLogEntry({
      set,
      chatId,
      messageId: assistantMessage.id,
      name,
      input: {},
      category: category === 'tutor_content' || category === 'tutor_meta' ? 'tutor' : category,
    });
  };

  // Handle tool call deltas as they stream in - pre-log immediately on first delta
  const handleToolCallDelta = (deltas: Array<{ index: number; function?: { name?: string } }>) => {
    for (const delta of deltas) {
      if (preLoggedToolIndices.has(delta.index)) continue;
      const name = delta.function?.name;
      if (name && name.length > 0) {
        preLoggedToolIndices.add(delta.index);
        preLogToolCall(name);
      }
    }
  };

  // If no tools available, just do a single streaming call with UI callbacks
  if (!hasTools) {
    const finalSystem = buildFinalSystem();
    const finalMessages: ModelMessage[] = [
      // buildSystemMessage always returns a value when combinedSystem is defined
      buildSystemMessage({ combinedSystem: finalSystem, systemStable, systemDynamic })!,
      ...convo.filter((m) => m.role !== 'system'),
    ];

    emitPlanResult(finalSystem);
    await executeStreamCall(ctx, {
      messages: applyCacheBreakpoints(finalMessages),
      tools: undefined,
      toolChoice: undefined,
      callbacks: createUiCallbacks(performance.now()),
    });

    return buildResult(state, finalSystem, sideEffects);
  }

  // Helper to schedule and filter tool calls
  const scheduleTools = (toolCalls: ToolCall[]): ToolCall[] =>
    schedulePlanningRound({
      toolCalls,
      allowedTutorTools,
      toolPolicy,
      phase,
      currentPlan: state.currentPlan ?? currentPlan,
      usedTutorContentTool: state.usedTutorContentTool,
      searchEnabled,
      searchProvider,
      quizCallsThisTurn: state.quizCallsThisTurn,
      maxToolsPerTurn,
      toolsUsedThisTurn: state.toolsUsedThisTurn,
    });

  // Helper to process a tool round: add messages, execute tools, add follow-up
  const processToolRound = async (
    roundContent: string,
    scheduled: ToolCall[],
    round: number,
    options?: { reasoningDetails?: unknown; applySideEffect?: boolean },
  ): Promise<void> => {
    const applySideEffect = options?.applySideEffect ?? true;
    // Add assistant message with tool calls to conversation
    const assistantMsg: ModelMessage = {
      role: 'assistant',
      content: roundContent || '',
      tool_calls: scheduled,
      ...(options?.reasoningDetails !== undefined
        ? { reasoning_details: options.reasoningDetails }
        : {}),
    };
    convo.push(assistantMsg);

    // Record planning content as side effect for UI
    if (roundContent.trim()) {
      emitPlanSideEffect(
        {
          type: 'append_planning_content',
          chatId,
          messageId: assistantMessage.id,
          content: roundContent,
        },
        applySideEffect,
      );
    }

    // Execute tools
    state = await applyToolExecutions({
      scheduled,
      round,
      convo,
      context: {
        chat,
        chatId,
        assistantMessage,
        userContent,
        searchProvider,
        controller,
        set,
        get,
        persistMessage,
      },
      state,
    });
    currentPlan = state.currentPlan ?? currentPlan;

    // Add follow-up prompt for next round
    convo.push({ role: 'user', content: followUpPrompt({ searchEnabled, searchProvider }) });
  };

  // First round: stream with UI callbacks connected
  // If no tool calls, this is our only LLM call
  let roundContent = '';
  let roundToolCalls: ToolCall[] = [];
  let roundFinishReason: StreamDoneExtras['finishReason'];
  let roundReasoningDetails: StreamDoneExtras['reasoningDetails'];
  let shouldRetryFirstRound = false;

  const uiCallbacks = createUiCallbacks(performance.now());
  const finalizeShortCircuit = () => {
    const snapshot = get?.();
    const current = snapshot?.messagesById?.[assistantMessage.id];
    const content = typeof current?.content === 'string' ? current.content : '';
    uiCallbacks.onDone?.(content, { finishReason: 'tool_calls' });
  };
  const firstRoundCallbacks: StreamCallbacks = {
    ...uiCallbacks,
    onToken: (delta) => {
      roundContent += delta;
      uiCallbacks.onToken?.(delta);
    },
    onToolCallDelta: handleToolCallDelta,
    onDone: (full, extras) => {
      roundFinishReason = extras?.finishReason;
      roundReasoningDetails = extras?.reasoningDetails;
      if (extras?.toolCalls) {
        roundToolCalls = extras.toolCalls;
      }
      // Only call uiCallbacks.onDone if we're NOT going to execute tools
      if (roundFinishReason !== 'tool_calls' || roundToolCalls.length === 0) {
        shouldRetryFirstRound = Boolean(
          planningToolDefinition?.length &&
            looksIncomplete(full || roundContent, roundFinishReason) &&
            !controller.signal.aborted,
        );
        if (!shouldRetryFirstRound) {
          const finalSystem = buildFinalSystem();
          emitPlanResult(finalSystem);
          uiCallbacks.onDone?.(full, extras);
        }
      }
    },
  };

  await executeStreamCall(ctx, {
    messages: applyCacheBreakpoints(convo),
    tools: planningToolDefinition,
    toolChoice: 'auto',
    callbacks: firstRoundCallbacks,
  });

  // No tool calls — retry once if the response looks incomplete and tools were available
  if (roundFinishReason !== 'tool_calls' || roundToolCalls.length === 0) {
    if (shouldRetryFirstRound) {
      roundContent = '';
      roundToolCalls = [];
      roundFinishReason = undefined;
      roundReasoningDetails = undefined;

      const retryCallbacks: StreamCallbacks = {
        ...uiCallbacks,
        onToken: (delta) => {
          roundContent += delta;
          uiCallbacks.onToken?.(delta);
        },
        onToolCallDelta: handleToolCallDelta,
        onDone: (full, extras) => {
          roundFinishReason = extras?.finishReason;
          roundReasoningDetails = extras?.reasoningDetails;
          if (extras?.toolCalls) roundToolCalls = extras.toolCalls;
          if (roundFinishReason !== 'tool_calls' || roundToolCalls.length === 0) {
            emitPlanResult(buildFinalSystem());
            uiCallbacks.onDone?.(full, extras);
          }
        },
      };

      await executeStreamCall(ctx, {
        messages: applyCacheBreakpoints(convo),
        tools: planningToolDefinition,
        toolChoice: 'auto',
        callbacks: retryCallbacks,
      });

      if (roundFinishReason !== 'tool_calls' || roundToolCalls.length === 0) {
        return buildResult(state, buildFinalSystem(), sideEffects);
      }
      // Fall through to tool scheduling
    } else {
      return buildResult(state, buildFinalSystem(), sideEffects);
    }
  }

  // Schedule first round of tools
  let scheduled = scheduleTools(roundToolCalls);
  if (scheduled.length === 0) {
    const finalSystem = buildFinalSystem();
    const planResult = emitPlanResult(finalSystem);
    if (shouldShortCircuit?.(planResult)) {
      finalizeShortCircuit();
      return buildResult(state, finalSystem, sideEffects, true);
    }
    uiCallbacks.onDone?.(roundContent, { finishReason: roundFinishReason });
    return buildResult(state, finalSystem, sideEffects);
  }

  await processToolRound(roundContent, scheduled, 1, {
    reasoningDetails: roundReasoningDetails,
    applySideEffect: false,
  });
  let rounds = 1;

  // Continue tool execution loop for subsequent rounds (without UI callbacks)
  while (rounds < MAX_PLANNING_ROUNDS) {
    roundContent = '';
    roundToolCalls = [];
    roundFinishReason = undefined;
    roundReasoningDetails = undefined;

    const roundCallbacks: StreamCallbacks = {
      onToken: (delta) => {
        roundContent += delta;
      },
      onToolCallDelta: handleToolCallDelta,
      onDone: (_full, extras) => {
        roundFinishReason = extras?.finishReason;
        roundReasoningDetails = extras?.reasoningDetails;
        if (extras?.toolCalls) {
          roundToolCalls = extras.toolCalls;
        }
      },
    };

    await executeStreamCall(ctx, {
      messages: applyCacheBreakpoints(convo),
      tools: planningToolDefinition,
      toolChoice: 'auto',
      callbacks: roundCallbacks,
    });

    // No tool calls - break out
    if (roundFinishReason !== 'tool_calls' || roundToolCalls.length === 0) {
      break;
    }

    scheduled = scheduleTools(roundToolCalls);
    if (scheduled.length === 0) {
      break;
    }

    await processToolRound(roundContent, scheduled, rounds + 1, {
      reasoningDetails: roundReasoningDetails,
    });
    rounds += 1;
  }

  // Final streaming call with updated system and toolChoice='none'
  const finalSystem = buildFinalSystem();
  const planResult = emitPlanResult(finalSystem);
  if (shouldShortCircuit?.(planResult)) {
    finalizeShortCircuit();
    return buildResult(state, finalSystem, sideEffects, true);
  }
  const finalMessages: ModelMessage[] = [
    buildSystemMessage({ combinedSystem: finalSystem, systemStable, systemDynamic })!,
    ...convo.filter((m) => m.role !== 'system'),
  ];

  await executeStreamCall(ctx, {
    messages: applyCacheBreakpoints(finalMessages),
    tools: planningToolDefinition,
    toolChoice: 'none',
    callbacks: createUiCallbacks(performance.now()),
  });

  return buildResult(state, finalSystem, sideEffects);
}
