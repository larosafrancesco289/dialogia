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
} from '@/lib/agent/types';
import { executePlanningToolCall } from '@/lib/agent/tools/exec';
import { captureRequestDebug } from '@/lib/agent/debug';
import { shouldIncludeUsage } from '@/lib/api/normalizers';
import { detectPlanningToolCalls } from '@/lib/agent/tools/router';

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

  const planningSystem =
    combinedSystem != null ? ({ role: 'system', content: combinedSystem } as const) : undefined;

  const planningMessages: ModelMessage[] = planningSystem
    ? [planningSystem, ...baseMessages.filter((entry) => entry.role !== 'system')]
    : baseMessages.slice();

  let convo = planningMessages.slice();
  let rounds = 0;
  let usedTool = false;
  let usedTutorContentTool = false;
  let aggregatedResults: SearchResult[] = [];
  let learnerModelResult: PlanTurnResult['learnerModel'] | undefined;
  let planUpdatesResult: PlanTurnResult['planUpdates'] | undefined;
  let updatedPlanResult: PlanTurnResult['updatedPlan'] | undefined;
  let learnerModelDebugResult: PlanTurnResult['learnerModelDebug'] | undefined;

  while (rounds < MAX_PLANNING_ROUNDS) {
    const modelMeta = modelIndex.get(chat.settings.model);
    const caps = modelIndex.caps(chat.settings.model);
    const supportsReasoning = caps.canReason;
    const supportsTools = isToolCallingSupported(modelMeta);
    const toolsForPlanning =
      supportsTools && Array.isArray(toolDefinition) && toolDefinition.length > 0
        ? (toolDefinition as ToolDefinition[])
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
    const message = choice?.message || {};
    const toolCalls: ToolCall[] = detectPlanningToolCalls({
      message,
      toolDefinition,
    });

    if (toolCalls.length > 0) {
      usedTool = true;
      convo.push({ role: 'assistant', content: null, tool_calls: toolCalls });
    }

    if (toolCalls.length === 0) {
      break;
    }

    for (const tc of toolCalls) {
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
      if (execution.updatedPlan) updatedPlanResult = execution.updatedPlan;
      if (execution.learnerModelDebug) learnerModelDebugResult = execution.learnerModelDebug;
      if (execution.usedTool) usedTool = true;
      if (execution.usedTutorContentTool) usedTutorContentTool = true;
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
