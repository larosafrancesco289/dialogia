// Module: agent/planning
// Responsibility: Handle multi-round planning for assistant turns before final streaming.

import { getChatCompletion } from '@/lib/agent/pipelineClient';
import { buildDebugBody, recordDebugIfEnabled } from '@/lib/agent/request';
import {
  applyTutorToolCall,
  extractTutorToolCalls,
  extractWebSearchArgs,
  isTutorToolName,
  performWebSearchTool,
} from '@/lib/agent/tools';
import { formatSourcesBlock, mergeSearchResults } from '@/lib/agent/searchFlow';
import {
  DEFAULT_BASE_SYSTEM,
  followUpPrompt,
  MAX_PLANNING_ROUNDS,
  shouldAppendSources,
} from '@/lib/agent/policy';
import { MAX_FALLBACK_RESULTS } from '@/lib/constants';
import { isToolCallingSupported } from '@/lib/models';
import { createToolCall, normalizeToolCalls, parseToolArguments } from '@/lib/agent/parsers';
import { combineSystem } from '@/lib/agent/system';
import type {
  ModelMessage,
  PlanTurnOptions,
  PlanTurnResult,
  SearchResult,
  ToolCall,
  ToolDefinition,
  WebSearchArgs,
} from '@/lib/agent/types';
import { NOTICE_MISSING_BRAVE_KEY } from '@/lib/store/notices';

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
    apiKey,
    controller,
    set,
    get,
    modelIndex,
    persistMessage,
  } = opts;

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

  while (rounds < MAX_PLANNING_ROUNDS) {
    const modelMeta = modelIndex.get(chat.settings.model);
    const caps = modelIndex.caps(chat.settings.model);
    const supportsReasoning = caps.canReason;
    const supportsTools = isToolCallingSupported(modelMeta);
    const toolsForPlanning =
      supportsTools && Array.isArray(toolDefinition) && toolDefinition.length > 0
        ? (toolDefinition as ToolDefinition[])
        : undefined;

    try {
      const dbg = buildDebugBody({
        modelId: chat.settings.model,
        messages: convo,
        stream: false,
        temperature: chat.settings.temperature,
        top_p: chat.settings.top_p,
        max_tokens: chat.settings.max_tokens,
        reasoningEffort: supportsReasoning ? chat.settings.reasoning_effort : undefined,
        reasoningTokens: supportsReasoning ? chat.settings.reasoning_tokens : undefined,
        tools: toolsForPlanning,
        toolChoice: toolsForPlanning ? 'auto' : undefined,
        providerSort,
      });
      recordDebugIfEnabled({ set, get }, assistantMessage.id, dbg);
    } catch {
      // ignore debug capture issues
    }

    const resp = await getChatCompletion()({
      apiKey,
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
    let toolCalls: ToolCall[] = normalizeToolCalls(message);

    if (toolCalls.length === 0 && typeof message?.content === 'string') {
      const inlineSearch = extractWebSearchArgs(message.content);
      if (inlineSearch) {
        toolCalls = [
          createToolCall('web_search', inlineSearch as Record<string, unknown>, 'inline_web_search'),
        ];
      } else {
        const tutorCalls = extractTutorToolCalls(message.content);
        if (tutorCalls.length > 0) {
          toolCalls = tutorCalls.map((call, index) =>
            createToolCall(call.name, call.args, `inline_tutor_${index}`),
          );
        }
      }
    }

    if (toolCalls.length > 0) {
      usedTool = true;
      convo.push({ role: 'assistant', content: null, tool_calls: toolCalls });
    }

    if (toolCalls.length === 0) {
      break;
    }

    for (const tc of toolCalls) {
      const callName = tc.function.name;
      const parsedArgs = parseToolArguments(tc);

      if (callName === 'web_search') {
        const searchArgs: WebSearchArgs = {
          query: typeof parsedArgs.query === 'string' ? parsedArgs.query : '',
          count: typeof parsedArgs.count === 'number' ? parsedArgs.count : undefined,
        };
        const searchResult = await performWebSearchTool({
          args: searchArgs,
          fallbackQuery: userContent,
          searchProvider,
          controller,
          assistantMessageId: assistantMessage.id,
          chatId,
          set,
        });
        if (searchResult.ok) {
          aggregatedResults = mergeSearchResults([aggregatedResults, searchResult.results]);
          const payload = searchResult.results
            .slice(0, MAX_FALLBACK_RESULTS)
            .map((r) => ({
              title: r?.title,
              url: r?.url,
              description: r?.description,
            }));
          convo.push({
            role: 'tool',
            name: 'web_search',
            tool_call_id: tc.id,
            content: JSON.stringify(payload),
          });
        } else {
          if (searchResult.error === NOTICE_MISSING_BRAVE_KEY) {
            set((state) => ({ ui: { ...state.ui, notice: NOTICE_MISSING_BRAVE_KEY } }));
          }
          convo.push({
            role: 'tool',
            name: 'web_search',
            tool_call_id: tc.id,
            content: 'No results',
          });
        }
        usedTool = true;
        continue;
      }

      if (isTutorToolName(callName)) {
        const tutorOutcome = await applyTutorToolCall({
          name: callName,
          args: parsedArgs,
          chat,
          chatId,
          assistantMessage,
          set,
          persistMessage,
        });
        if (tutorOutcome.handled) {
          if (tutorOutcome.usedContent) usedTutorContentTool = true;
          if (tutorOutcome.payload) {
            convo.push({
              role: 'tool',
              name: callName,
              tool_call_id: tc.id,
              content: tutorOutcome.payload,
            });
          }
          usedTool = true;
        }
      }
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

  return { finalSystem, usedTutorContentTool, hasSearchResults: hasResults };
}
