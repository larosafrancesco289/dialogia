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
  ToolDefinition,
  ToolCall,
  AssistantModelMessage,
} from '@/lib/agent/types';
import { executePlanningToolCall } from '@/lib/agent/tools/exec';
import { captureRequestDebug } from '@/lib/agent/debug';
import { shouldIncludeUsage } from '@/lib/api/normalizers';
import { detectPlanningToolCalls } from '@/lib/agent/tools/router';
import { schedulePlanningToolCalls } from '@/lib/agent/tools/scheduler';
import {
  allowedTutorToolsForPhase,
  deriveTutorToolPolicy,
  getTutorPhase,
} from '@/lib/agent/tutor/state';
import { isTutorToolName } from '@/lib/agent/tools';
import { getNextNode } from '@/lib/learningPlan/service';
import type { Message } from '@/lib/types';

const QUIZ_TOOL_NAMES = new Set(['quiz_mcq', 'quiz_fill_blank', 'quiz_open_ended']);

export async function planTurn(opts: PlanTurnOptions): Promise<PlanTurnResult> {
  const {
    chat,
    chatId,
    assistantMessage,
    userContent,
    combinedSystem,
    baseMessages,
    toolDefinition,
    searchEnabled,
    searchProvider,
    providerSort,
    controller,
    turn,
  } = opts;
  const { apiKey, transport, set, get, modelIndex, persistMessage } = turn;
  const storeState = get?.();
  const messagesForChat = (storeState?.messages?.[chatId] ?? []) as Message[];
  const phase = getTutorPhase(chat, messagesForChat, storeState?.ui);
  let currentPlan = chat.settings.learningPlan;
  const activeNodeId = currentPlan ? getNextNode(currentPlan)?.id : undefined;
  const toolPolicy = deriveTutorToolPolicy({
    chat,
    ui: storeState?.ui,
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

  const planningSystem =
    combinedSystem != null ? ({ role: 'system', content: combinedSystem } as const) : undefined;

  const planningMessages: ModelMessage[] = planningSystem
    ? [planningSystem, ...baseMessages.filter((entry) => entry.role !== 'system')]
    : baseMessages.slice();

  const convo = planningMessages.slice();
  let rounds = 0;
  let usedTutorContentTool = false;
  let aggregatedResults: SearchResult[] = [];
  let learnerModelResult: PlanTurnResult['learnerModel'] | undefined;
  let planUpdatesResult: PlanTurnResult['planUpdates'] | undefined;
  let updatedPlanResult: PlanTurnResult['updatedPlan'] | undefined;
  let learnerModelDebugResult: PlanTurnResult['learnerModelDebug'] | undefined;
  let toolsUsedThisTurn = 0;
  let quizCallsThisTurn = 0;
  const maxToolsPerTurn =
    toolPolicy.maxToolsPerTurn && Number.isFinite(toolPolicy.maxToolsPerTurn)
      ? Math.max(1, toolPolicy.maxToolsPerTurn)
      : Infinity;

  while (rounds < MAX_PLANNING_ROUNDS) {
    const modelMeta = modelIndex.get(chat.settings.model);
    const caps = modelIndex.caps(chat.settings.model);
    const supportsReasoning = caps.canReason;
    const supportsTools = isToolCallingSupported(modelMeta);
    const toolsForPlanning =
      supportsTools && Array.isArray(planningToolDefinition) && planningToolDefinition.length > 0
        ? planningToolDefinition
        : undefined;

    captureRequestDebug({
      turn,
      messageId: assistantMessage.id,
      modelId: chat.settings.model,
      messages: convo,
      stream: false,
      includeUsage: shouldIncludeUsage(false),
      temperature: chat.settings.temperature,
      topP: chat.settings.top_p,
      maxTokens: chat.settings.max_tokens,
      reasoningEffort: supportsReasoning ? chat.settings.reasoning_effort : undefined,
      reasoningTokens: supportsReasoning ? chat.settings.reasoning_tokens : undefined,
      tools: toolsForPlanning,
      toolChoice: toolsForPlanning ? 'auto' : undefined,
      providerSort,
    });

    const resp = await getChatCompletion()({
      apiKey,
      transport,
      model: chat.settings.model,
      messages: convo,
      temperature: chat.settings.temperature,
      top_p: chat.settings.top_p,
      max_tokens: chat.settings.max_tokens,
      reasoning_effort: supportsReasoning ? chat.settings.reasoning_effort : undefined,
      reasoning_tokens: supportsReasoning ? chat.settings.reasoning_tokens : undefined,
      tools: toolsForPlanning,
      tool_choice: toolsForPlanning ? ('auto' as const) : undefined,
      signal: controller.signal,
      providerSort,
      plugins: undefined,
    });

    const choice = resp?.choices?.[0];
    const message = (choice?.message || {}) as Partial<AssistantModelMessage>;
    const toolCalls: ToolCall[] = detectPlanningToolCalls({
      message,
      toolDefinition: planningToolDefinition,
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

    const scheduledRaw = schedulePlanningToolCalls(filteredToolCalls, {
      hasPlan: Boolean(currentPlan),
      hasActiveNode: Boolean(currentPlan?.nodes.some((node) => node.status === 'in_progress')),
      alreadyUsedContent: usedTutorContentTool,
      allowSearch: searchEnabled && searchProvider === 'brave',
      phase,
    });

    let remainingQuizBudget =
      (toolPolicy.quizzesRemaining ?? Number.POSITIVE_INFINITY) - quizCallsThisTurn;
    let remainingTools = Math.max(0, maxToolsPerTurn - toolsUsedThisTurn);
    const scheduled: ToolCall[] = [];

    for (const call of scheduledRaw) {
      if (remainingTools <= 0) break;
      const name = call.function?.name ?? '';
      if (QUIZ_TOOL_NAMES.has(name)) {
        if (remainingQuizBudget <= 0) continue;
        remainingQuizBudget -= 1;
      }
      scheduled.push(call);
      remainingTools -= 1;
    }

    if (scheduled.length > 0) {
      convo.push({ role: 'assistant', content: null, tool_calls: scheduled });
    }

    if (scheduled.length === 0) {
      break;
    }

    for (const tc of scheduled) {
      const toolName = tc.function?.name ?? '';
      const parsedArgs = parseToolArguments(tc);
      const roundMeta =
        Number.isFinite(rounds) && Number.isFinite(rounds + 1)
          ? { round: rounds + 1 }
          : undefined;
      const execution = await executePlanningToolCall({
        toolCall: tc,
        parsedArgs,
        roundMeta,
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
        aggregatedResults,
      });
      if (execution.convoMessages.length > 0) {
        convo.push(...execution.convoMessages);
      }
      aggregatedResults = execution.aggregatedResults;
      if (execution.learnerModel) learnerModelResult = execution.learnerModel;
      if (execution.planUpdates) planUpdatesResult = execution.planUpdates;
      if (execution.updatedPlan) {
        updatedPlanResult = execution.updatedPlan;
        currentPlan = execution.updatedPlan;
      }
      if (execution.learnerModelDebug) learnerModelDebugResult = execution.learnerModelDebug;
      if (execution.usedTutorContentTool) {
        usedTutorContentTool = true;
      }
      if (QUIZ_TOOL_NAMES.has(toolName)) {
        quizCallsThisTurn += 1;
      }
      toolsUsedThisTurn += 1;
    }

    const followup = followUpPrompt({ searchEnabled, searchProvider });
    convo.push({ role: 'user', content: followup });
    rounds += 1;
  }

  const baseSystem =
    combinedSystem && combinedSystem.trim()
      ? combinedSystem
      : chat.settings.system && chat.settings.system.trim()
        ? chat.settings.system
        : DEFAULT_BASE_SYSTEM;
  const hasResults = shouldAppendSources(aggregatedResults);
  const sourcesAppendix = hasResults
    ? formatSourcesBlock(aggregatedResults, searchProvider)
    : undefined;
  const finalSystem = combineSystem(baseSystem, [], sourcesAppendix) ?? baseSystem;

  return {
    finalSystem,
    usedTutorContentTool,
    hasSearchResults: hasResults,
    learnerModel: learnerModelResult,
    planUpdates: planUpdatesResult,
    updatedPlan: updatedPlanResult,
    learnerModelDebug: learnerModelDebugResult,
  };
}
