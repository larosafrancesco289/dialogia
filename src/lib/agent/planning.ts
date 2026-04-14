// Module: agent/planning
// Responsibility: Handle multi-round planning for assistant turns before final streaming.

import { formatSourcesBlock } from '@/lib/search';
import { MAX_PLANNING_ROUNDS, shouldAppendSources } from '@/lib/agent/policy';
import { DEFAULT_BASE_SYSTEM } from '@/lib/agent/prompts/baseSystem';
import { followUpPrompt } from '@/lib/agent/prompts/followUp';
import { combineSystem } from '@/lib/agent/system';
import { buildSystemMessage } from '@/lib/agent/cache';
import type {
  ModelMessage,
  PlanTurnOptions,
  PlanTurnOutput,
  PlanTurnSideEffect,
} from '@/lib/agent/types';
import { derivePlanningContext } from '@/lib/agent/planning/context';
import { applyToolExecutions } from '@/lib/agent/planning/apply';
import { runPlanningRound } from '@/lib/agent/planning/round';
import { schedulePlanningRound } from '@/lib/agent/planning/schedule';
import type { PlanningExecutionState } from '@/lib/agent/planning/types';
import { getMessagesForChat } from '@/lib/messages/indexing';
import { resolveModelTransport } from '@/lib/providers';

function buildPlanningMessages(
  baseMessages: ModelMessage[],
  combinedSystem?: string,
  systemStable?: string,
  systemDynamic?: string,
): ModelMessage[] {
  const sysMsg = buildSystemMessage({ combinedSystem, systemStable, systemDynamic });
  if (sysMsg) {
    return [sysMsg, ...baseMessages.filter((m) => m.role !== 'system')];
  }
  return baseMessages.slice();
}

export async function planTurn(opts: PlanTurnOptions): Promise<PlanTurnOutput> {
  const {
    chat,
    chatId,
    assistantMessage,
    userContent,
    combinedSystem,
    systemStable,
    systemDynamic,
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
  let currentPlan = chat.settings.features.tutor.learningPlan;
  const sideEffects: PlanTurnSideEffect[] = [];
  const { planningToolDefinition, allowedTutorTools, toolPolicy, phase } = derivePlanningContext({
    chat,
    messagesForChat,
    ui: storeState?.ui,
    toolDefinition,
    currentPlan,
  });

  const planningMessages = buildPlanningMessages(
    baseMessages,
    combinedSystem,
    systemStable,
    systemDynamic,
  );

  const convo = planningMessages.slice();
  let rounds = 0;
  const searchEnabled = settings.searchEnabled;
  const searchProvider = settings.searchProvider || 'openrouter';
  const shouldAppendToolFollowUp =
    resolveModelTransport(settings.modelId, settings.modelMeta) !== 'anthropic';

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
    successfulToolCallsThisTurn: 0,
    failedToolCallsThisTurn: 0,
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

      // Write the text content to the UI message so it's visible alongside tool results
      if (typeof message.content === 'string' && message.content.trim()) {
        sideEffects.push({
          type: 'append_planning_content',
          chatId,
          messageId: assistantMessage.id,
          content: message.content,
        });
      }
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

    if (shouldAppendToolFollowUp) {
      const followup = followUpPrompt({ searchEnabled, searchProvider });
      convo.push({ role: 'user', content: followup });
    }
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
    result: {
      finalSystem,
      usedTutorContentTool: state.usedTutorContentTool,
      hasSearchResults: hasResults,
      learnerModel: state.learnerModel,
      planUpdates: state.planUpdates,
      updatedPlan: state.updatedPlan,
      learnerModelDebug: state.learnerModelDebug,
    },
    sideEffects,
  };
}
