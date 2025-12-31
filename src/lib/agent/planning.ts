// Module: agent/planning
// Responsibility: Handle multi-round planning for assistant turns before final streaming.

import { getChatCompletion } from '@/lib/agent/pipelineClient';
import { formatSourcesBlock } from '@/lib/agent/searchFlow';
import {
  DEFAULT_BASE_SYSTEM,
  followUpPrompt,
  MAX_PLANNING_ROUNDS,
  shouldAppendSources,
} from '@/lib/agent/policy';
import { isToolCallingSupported } from '@/lib/models';
import { parseToolArguments } from '@/lib/agent/parsers';
import { combineSystem } from '@/lib/agent/system';
import type {
  ModelMessage,
  PlanTurnOptions,
  PlanTurnResult,
  SearchResult,
  ToolCall,
  AssistantModelMessage,
  ToolDefinition,
  TutorToolName,
} from '@/lib/agent/types';
import { executePlanningToolCall } from '@/lib/agent/tools/exec';
import { captureRequestDebug } from '@/lib/agent/debug';
import { shouldIncludeUsage } from '@/lib/api/normalizers';
import { generationSettingsToOpenRouterParams } from '@/lib/settings/generation';
import { detectPlanningToolCalls } from '@/lib/agent/tools/router';
import { isQuizToolName, schedulePlanningTools } from '@/lib/agent/tools/schedulingPolicy';
import {
  allowedTutorToolsForPhase,
  deriveTutorToolPolicy,
  getTutorPhase,
  type TutorPhase,
  type TutorToolPolicy,
} from '@/lib/agent/tutor/state';
import { isTutorToolName } from '@/lib/agent/tools';
import { getNextNode } from '@/lib/learningPlan/service';
import type { Message } from '@/lib/types';
import type { UiSnapshot } from '@/lib/contracts/ui';

function filterAllowedToolsForPhase(args: {
  toolDefinition?: ToolDefinition[];
  chat: PlanTurnOptions['chat'];
  ui?: UiSnapshot;
  phase: TutorPhase;
  activeNodeId?: string;
}): {
  planningToolDefinition?: ToolDefinition[];
  allowedTutorTools: Set<TutorToolName>;
  toolPolicy: TutorToolPolicy;
} {
  const { toolDefinition, chat, ui, phase, activeNodeId } = args;
  const toolPolicy = deriveTutorToolPolicy({
    chat,
    ui,
    activeNodeId,
  });
  const allowedTutorTools = new Set(allowedTutorToolsForPhase(phase, toolPolicy));
  const planningToolDefinition =
    Array.isArray(toolDefinition) && toolDefinition.length > 0
      ? toolDefinition.filter((def) => {
          const name = def.function?.name;
          if (!name) return false;
          if (isTutorToolName(name)) return allowedTutorTools.has(name);
          return true;
        })
      : undefined;

  return { planningToolDefinition, allowedTutorTools, toolPolicy };
}

type PlanningContext = {
  phase: TutorPhase;
  planningToolDefinition?: ToolDefinition[];
  allowedTutorTools: Set<TutorToolName>;
  toolPolicy: TutorToolPolicy;
};

type PlanningExecutionState = {
  aggregatedResults: SearchResult[];
  usedTutorContentTool: boolean;
  learnerModel?: PlanTurnResult['learnerModel'];
  planUpdates?: PlanTurnResult['planUpdates'];
  updatedPlan?: PlanTurnResult['updatedPlan'];
  learnerModelDebug?: PlanTurnResult['learnerModelDebug'];
  currentPlan?: PlanTurnOptions['chat']['settings']['learningPlan'];
  toolsUsedThisTurn: number;
  quizCallsThisTurn: number;
};

function derivePlanningContext(args: {
  chat: PlanTurnOptions['chat'];
  messagesForChat: Message[];
  ui?: UiSnapshot;
  toolDefinition?: ToolDefinition[];
  currentPlan?: PlanTurnOptions['chat']['settings']['learningPlan'];
}): PlanningContext {
  const { chat, messagesForChat, ui, toolDefinition, currentPlan } = args;
  const phase = getTutorPhase(chat, messagesForChat, ui);
  const activeNodeId = currentPlan ? getNextNode(currentPlan)?.id : undefined;
  const { planningToolDefinition, allowedTutorTools, toolPolicy } = filterAllowedToolsForPhase({
    toolDefinition,
    chat,
    ui,
    phase,
    activeNodeId,
  });
  return { phase, planningToolDefinition, allowedTutorTools, toolPolicy };
}

function buildPlanningMessages(
  baseMessages: ModelMessage[],
  combinedSystem?: string,
): ModelMessage[] {
  const planningSystem =
    combinedSystem != null ? ({ role: 'system', content: combinedSystem } as const) : undefined;
  return planningSystem
    ? [planningSystem, ...baseMessages.filter((entry) => entry.role !== 'system')]
    : baseMessages.slice();
}

async function runPlanningRound(args: {
  convo: ModelMessage[];
  assistantMessage: Message;
  toolDefinition?: ToolDefinition[];
  controller: AbortController;
  turn: PlanTurnOptions['turn'];
  settings: PlanTurnOptions['settings'];
}): Promise<{
  message: Partial<AssistantModelMessage> & { reasoning_details?: unknown };
  toolCalls: ToolCall[];
  toolsForPlanning?: ToolDefinition[];
}> {
  const { convo, assistantMessage, toolDefinition, controller, turn, settings } = args;
  const { apiKey, transport } = turn;
  const generation = settings.generation;
  const supportsTools = isToolCallingSupported(settings.modelMeta);
  const toolsForPlanning =
    supportsTools && Array.isArray(toolDefinition) && toolDefinition.length > 0
      ? toolDefinition
      : undefined;

  captureRequestDebug({
    turn,
    messageId: assistantMessage.id,
    modelId: settings.modelId,
    messages: convo,
    stream: false,
    includeUsage: shouldIncludeUsage(false),
    temperature: generation.temperature,
    topP: generation.topP,
    maxTokens: generation.maxTokens,
    reasoningEffort: generation.reasoningEffort,
    reasoningTokens: generation.reasoningTokens,
    tools: toolsForPlanning,
    toolChoice: toolsForPlanning ? 'auto' : undefined,
    providerSort: generation.providerSort,
  });

  const openRouterSettings = generationSettingsToOpenRouterParams(generation);
  const resp = await getChatCompletion()({
    apiKey,
    transport,
    model: settings.modelId,
    messages: convo,
    ...openRouterSettings,
    tools: toolsForPlanning,
    tool_choice: toolsForPlanning ? ('auto' as const) : undefined,
    signal: controller.signal,
    plugins: undefined,
  });

  const choice = resp?.choices?.[0];
  const message = (choice?.message || {}) as Partial<AssistantModelMessage> & {
    reasoning_details?: unknown;
  };
  const toolCalls: ToolCall[] = detectPlanningToolCalls({
    message,
    toolDefinition,
  });

  return { message, toolCalls, toolsForPlanning };
}

async function applyToolExecutions(args: {
  scheduled: ToolCall[];
  round: number;
  convo: ModelMessage[];
  context: {
    chat: PlanTurnOptions['chat'];
    chatId: string;
    assistantMessage: Message;
    userContent: string;
    searchProvider: 'brave' | 'openrouter';
    controller: AbortController;
    set: PlanTurnOptions['turn']['set'];
    get: PlanTurnOptions['turn']['get'];
    persistMessage: PlanTurnOptions['turn']['persistMessage'];
  };
  state: PlanningExecutionState;
}): Promise<PlanningExecutionState> {
  const { scheduled, round, convo, context, state } = args;
  const next: PlanningExecutionState = { ...state };
  for (const tc of scheduled) {
    const toolName = tc.function?.name ?? '';
    const parsedArgs = parseToolArguments(tc);
    const roundMeta = Number.isFinite(round) ? { round } : undefined;
    const execution = await executePlanningToolCall({
      toolCall: tc,
      parsedArgs,
      roundMeta,
      context,
      aggregatedResults: next.aggregatedResults,
    });
    if (execution.convoMessages.length > 0) {
      convo.push(...execution.convoMessages);
    }
    next.aggregatedResults = execution.aggregatedResults;
    if (execution.learnerModel) next.learnerModel = execution.learnerModel;
    if (execution.planUpdates) next.planUpdates = execution.planUpdates;
    if (execution.updatedPlan) {
      next.updatedPlan = execution.updatedPlan;
      next.currentPlan = execution.updatedPlan;
    }
    if (execution.learnerModelDebug) next.learnerModelDebug = execution.learnerModelDebug;
    if (execution.usedTutorContentTool) {
      next.usedTutorContentTool = true;
    }
    if (isQuizToolName(toolName)) {
      next.quizCallsThisTurn += 1;
    }
    next.toolsUsedThisTurn += 1;
  }
  return next;
}

export async function planTurn(opts: PlanTurnOptions): Promise<PlanTurnResult> {
  const {
    chat,
    chatId,
    assistantMessage,
    userContent,
    combinedSystem,
    baseMessages,
    toolDefinition,
    controller,
    turn,
    settings,
  } = opts;
  const { set, get, persistMessage } = turn;
  const storeState = get?.();
  const messagesForChat = (storeState?.messages?.[chatId] ?? []) as Message[];
  let currentPlan = chat.settings.learningPlan;
  const { planningToolDefinition, allowedTutorTools, toolPolicy, phase } = derivePlanningContext({
    chat,
    messagesForChat,
    ui: storeState?.ui,
    toolDefinition,
    currentPlan,
  });

  const planningMessages = buildPlanningMessages(baseMessages, combinedSystem);

  const convo = planningMessages.slice();
  let rounds = 0;
  const searchEnabled = !!settings.generation.searchEnabled;
  const searchProvider = settings.generation.searchProvider || 'openrouter';

  // Learner model updates are now handled by the tutor via tool calls at meaningful moments,
  // rather than automatically every turn. This reduces latency and API costs.
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

  while (rounds < MAX_PLANNING_ROUNDS) {
    const { message, toolCalls } = await runPlanningRound({
      convo,
      assistantMessage,
      toolDefinition: planningToolDefinition,
      controller,
      turn,
      settings,
    });

    const filteredToolCalls =
      toolCalls.length === 0
        ? []
        : toolCalls.filter((call) => {
            const name = call.function?.name ?? '';
            if (!name) return false;
            if (isTutorToolName(name)) return allowedTutorTools.has(name);
            return true;
          });

    const scheduled = schedulePlanningTools({
      toolCalls: filteredToolCalls,
      toolPolicy,
      phase,
      hasPlan: Boolean(state.currentPlan ?? currentPlan),
      hasActiveNode: Boolean(
        (state.currentPlan ?? currentPlan)?.nodes.some((node) => node.status === 'in_progress'),
      ),
      usedTutorContentTool: state.usedTutorContentTool,
      searchEnabled,
      searchProvider,
      quizCallsThisTurn: state.quizCallsThisTurn,
      maxToolsPerTurn,
      toolsUsedThisTurn: state.toolsUsedThisTurn,
    });

    if (scheduled.length > 0) {
      // Preserve the assistant's content and reasoning_details (required for Gemini and other
      // reasoning models that use thought signatures with tool calls)
      // Fall back to empty string if content is null (some providers reject null)
      const assistantMsg: ModelMessage = {
        role: 'assistant',
        content: message.content ?? '',
        tool_calls: scheduled,
        reasoning_details: message.reasoning_details,
      };
      convo.push(assistantMsg);
    }

    if (scheduled.length === 0) {
      break;
    }

    state = await applyToolExecutions({
      scheduled,
      round: rounds + 1,
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

    const followup = followUpPrompt({ searchEnabled, searchProvider });
    convo.push({ role: 'user', content: followup });
    rounds += 1;
  }

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
  const finalSystem = combineSystem(baseSystem, [], sourcesAppendix) ?? baseSystem;

  return {
    finalSystem,
    usedTutorContentTool: state.usedTutorContentTool,
    hasSearchResults: hasResults,
    learnerModel: state.learnerModel,
    planUpdates: state.planUpdates,
    updatedPlan: state.updatedPlan,
    learnerModelDebug: state.learnerModelDebug,
  };
}
