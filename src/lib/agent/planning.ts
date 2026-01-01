// Module: agent/planning
// Responsibility: Handle multi-round planning for assistant turns before final streaming.

import { formatSourcesBlock } from '@/lib/agent/searchFlow';
import {
  DEFAULT_BASE_SYSTEM,
  followUpPrompt,
  MAX_PLANNING_ROUNDS,
  shouldAppendSources,
} from '@/lib/agent/policy';
import { combineSystem } from '@/lib/agent/system';
import type { ModelMessage, PlanTurnOptions, PlanTurnResult } from '@/lib/agent/types';
import { derivePlanningContext } from '@/lib/agent/planning/context';
import { applyToolExecutions } from '@/lib/agent/planning/apply';
import { runPlanningRound } from '@/lib/agent/planning/round';
import { schedulePlanningRound } from '@/lib/agent/planning/schedule';
import type { PlanningExecutionState } from '@/lib/agent/planning/types';
import { getMessagesForChat } from '@/lib/messages/indexing';

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
    pipeline,
  } = opts;
  const { set, get, persistMessage } = turn;
  const storeState = get?.();
  const messagesForChat = storeState ? getMessagesForChat(storeState, chatId) : [];
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
      pipeline,
    });

    const scheduled = schedulePlanningRound({
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
