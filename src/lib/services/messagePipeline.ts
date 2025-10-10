// Module: services/messagePipeline
// Responsibility: Encapsulate planning and streaming flows for assistant turns.

import { chatCompletion, streamChatCompletion } from '@/lib/openrouter';
import { buildDebugBody, composePlugins, recordDebugIfEnabled } from '@/lib/agent/request';
import { createMessageStreamCallbacks } from '@/lib/agent/streamHandlers';
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
import type { ModelIndex } from '@/lib/models';
import { buildChatCompletionMessages } from '@/lib/agent/conversation';
import { createToolCall, normalizeToolCalls, parseToolArguments } from '@/lib/agent/parsers';
import { combineSystem } from '@/lib/agent/system';
import type { Chat, Message, ORModel } from '@/lib/types';
import { ProviderSort } from '@/lib/models/providerSort';
import type {
  ModelMessage,
  PlanTurnOptions,
  PlanTurnResult,
  RegenerateOptions,
  SearchProvider,
  SearchResult,
  StoreGetter,
  StoreSetter,
  StreamFinalOptions,
  ToolCall,
  ToolDefinition,
  WebSearchArgs,
} from '@/lib/agent/types';
import { clearTurnController, setTurnController } from '@/lib/services/controllers';
import { NOTICE_MISSING_BRAVE_KEY } from '@/lib/store/notices';

let chatCompletionImpl = chatCompletion;
let streamChatCompletionImpl = streamChatCompletion;

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
    models,
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
        ? toolDefinition
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
    } catch {}

    const resp = await chatCompletionImpl({
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


export async function streamFinal(opts: StreamFinalOptions): Promise<void> {
  const {
    chat,
    chatId,
    assistantMessage,
    messages,
    controller,
    apiKey,
    providerSort,
    set,
    get,
    models,
    modelIndex,
    persistMessage,
    plugins,
    toolDefinition,
    startBuffered,
  } = opts;

  const modelMeta = modelIndex.get(chat.settings.model);
  const caps = modelIndex.caps(chat.settings.model);
  const supportsReasoning = caps.canReason;
  const canImageOut = caps.canImageOut;
  const supportsTools = isToolCallingSupported(modelMeta);
  const includeTools = supportsTools && Array.isArray(toolDefinition) && toolDefinition.length > 0;
  const combinedPlugins = Array.isArray(plugins) && plugins.length > 0 ? plugins : undefined;
  const toolsForStreaming = includeTools ? toolDefinition : undefined;

  try {
    const dbg = buildDebugBody({
      modelId: chat.settings.model,
      messages: messages as any,
      stream: true,
      includeUsage: true,
      canImageOut,
      temperature: chat.settings.temperature,
      top_p: chat.settings.top_p,
      max_tokens: chat.settings.max_tokens,
      reasoningEffort: supportsReasoning ? chat.settings.reasoning_effort : undefined,
      reasoningTokens: supportsReasoning ? chat.settings.reasoning_tokens : undefined,
      tools: toolsForStreaming,
      toolChoice: includeTools ? 'none' : undefined,
      providerSort,
      plugins: combinedPlugins,
    });
    recordDebugIfEnabled({ set, get }, assistantMessage.id, dbg);
  } catch {}

  const requestedEffort = supportsReasoning ? chat.settings.reasoning_effort : undefined;
  const requestedTokensRaw = supportsReasoning ? chat.settings.reasoning_tokens : undefined;
  const effortRequested = typeof requestedEffort === 'string' && requestedEffort !== 'none';
  const tokensRequested = typeof requestedTokensRaw === 'number' && requestedTokensRaw > 0;
  const autoReasoningEligible = !effortRequested && !tokensRequested;
  const modelIdUsed = chat.settings.model;
  const tStart = performance.now();
  const callbacks = createMessageStreamCallbacks(
    {
      chatId,
      assistantMessage,
      set,
      get,
      startBuffered,
      autoReasoningEligible,
      modelIdUsed,
      clearController: () => clearTurnController(chatId),
      persistMessage,
    },
    { startedAt: tStart },
  );

  await streamChatCompletionImpl({
    apiKey,
    model: chat.settings.model,
    messages,
    modalities: canImageOut ? (['image', 'text'] as any) : undefined,
    temperature: chat.settings.temperature,
    top_p: chat.settings.top_p,
    max_tokens: chat.settings.max_tokens,
    reasoning_effort: supportsReasoning ? chat.settings.reasoning_effort : undefined,
    reasoning_tokens: supportsReasoning ? chat.settings.reasoning_tokens : undefined,
    signal: controller.signal,
    tools: toolsForStreaming,
    tool_choice: includeTools ? ('none' as any) : undefined,
    providerSort,
    plugins: combinedPlugins,
    callbacks,
  });
}

export async function regenerate(opts: RegenerateOptions): Promise<void> {
  const {
    chat,
    chatId,
    targetMessageId,
    messages,
    models,
    modelIndex,
    apiKey,
    controller,
    set,
    get,
    persistMessage,
    overrideModelId,
  } = opts;

  const index = messages.findIndex((msg) => msg.id === targetMessageId);
  if (index < 0) return;

  const original = messages[index];
  const priorMessages = messages.slice(0, index);
  const payload = buildChatCompletionMessages({ chat, priorMessages, models });
  const systemSnapshot: string | undefined = (original as any)?.systemSnapshot;
  const convo = systemSnapshot
    ? ([{ role: 'system', content: systemSnapshot } as const] as any[]).concat(
        payload.filter((entry: any) => entry.role !== 'system'),
      )
    : payload;

  const hadPdfEarlier = priorMessages.some(
    (msg) =>
      Array.isArray(msg.attachments) && msg.attachments.some((att: any) => att?.kind === 'pdf'),
  );

  const modelIdForTurn = overrideModelId || chat.settings.model;
  const modelMeta = modelIndex.get(modelIdForTurn);
  const caps = modelIndex.caps(modelIdForTurn);
  const supportsReasoning = caps.canReason;

  const snapshotSettings = ((original as any)?.genSettings as Record<string, unknown>) || {};
  const previousModelId =
    typeof (original as any)?.model === 'string' ? (original as any).model : undefined;
  const modelChanged = typeof modelIdForTurn === 'string' && modelIdForTurn !== previousModelId;

  const pickNumber = (snapshotVal: unknown, chatVal: unknown): number | undefined => {
    const fromSnapshot = typeof snapshotVal === 'number' ? snapshotVal : undefined;
    const fromChat = typeof chatVal === 'number' ? chatVal : undefined;
    if (modelChanged) return fromChat ?? fromSnapshot;
    return fromSnapshot ?? fromChat;
  };

  const pickReasoningEffort = (
    snapshotVal: unknown,
    chatVal: unknown,
  ): 'none' | 'low' | 'medium' | 'high' | undefined => {
    if (!supportsReasoning) return undefined;
    const fromSnapshot = typeof snapshotVal === 'string' ? (snapshotVal as any) : undefined;
    const fromChat = typeof chatVal === 'string' ? (chatVal as any) : undefined;
    if (modelChanged) return fromChat ?? fromSnapshot;
    return fromSnapshot ?? fromChat;
  };

  const pickReasoningTokens = (snapshotVal: unknown, chatVal: unknown): number | undefined => {
    if (!supportsReasoning) return undefined;
    const fromSnapshot = typeof snapshotVal === 'number' ? snapshotVal : undefined;
    const fromChat = typeof chatVal === 'number' ? chatVal : undefined;
    if (modelChanged) return fromChat ?? fromSnapshot;
    return fromSnapshot ?? fromChat;
  };

  const pickBoolean = (snapshotVal: unknown, chatVal: unknown, fallback = false): boolean => {
    const fromSnapshot = typeof snapshotVal === 'boolean' ? snapshotVal : undefined;
    const fromChat = typeof chatVal === 'boolean' ? chatVal : undefined;
    if (modelChanged) return fromChat ?? fromSnapshot ?? fallback;
    return fromSnapshot ?? fromChat ?? fallback;
  };

  const pickProvider = (
    snapshotVal: unknown,
    chatVal: unknown,
  ): SearchProvider | undefined => {
    const fromSnapshot = typeof snapshotVal === 'string' ? (snapshotVal as any) : undefined;
    const fromChat = typeof chatVal === 'string' ? (chatVal as any) : undefined;
    if (modelChanged) return fromChat ?? fromSnapshot;
    return fromSnapshot ?? fromChat;
  };

  const temperature = pickNumber(snapshotSettings.temperature, chat.settings.temperature);
  const topP = pickNumber(snapshotSettings.top_p, chat.settings.top_p);
  const maxTokens = pickNumber(snapshotSettings.max_tokens, chat.settings.max_tokens);
  const reasoningEffort = pickReasoningEffort(
    snapshotSettings.reasoning_effort,
    chat.settings.reasoning_effort,
  );
  const reasoningTokens = pickReasoningTokens(
    snapshotSettings.reasoning_tokens,
    chat.settings.reasoning_tokens,
  );
  const searchWithBrave = pickBoolean(
    snapshotSettings.search_with_brave,
    (chat.settings as any)?.search_with_brave,
    false,
  );
  const searchProvider = pickProvider(
    snapshotSettings.search_provider,
    (chat.settings as any)?.search_provider,
  );
  const tutorModeForTurn = pickBoolean(
    snapshotSettings.tutor_mode,
    chat.settings.tutor_mode,
    false,
  );
  const providerSortSnapshot = (snapshotSettings as Record<string, unknown>).providerSort;
  const providerSort: ProviderSort | undefined =
    providerSortSnapshot === ProviderSort.Price || providerSortSnapshot === ProviderSort.Throughput
      ? (providerSortSnapshot as ProviderSort)
      : undefined;

  const appliedGenSettings: Record<string, unknown> = {};
  if (typeof temperature === 'number') appliedGenSettings.temperature = temperature;
  if (typeof topP === 'number') appliedGenSettings.top_p = topP;
  if (typeof maxTokens === 'number') appliedGenSettings.max_tokens = maxTokens;
  if (supportsReasoning && typeof reasoningEffort === 'string')
    appliedGenSettings.reasoning_effort = reasoningEffort;
  if (supportsReasoning && typeof reasoningTokens === 'number')
    appliedGenSettings.reasoning_tokens = reasoningTokens;
  appliedGenSettings.search_with_brave = !!searchWithBrave;
  if (searchProvider) appliedGenSettings.search_provider = searchProvider;
  appliedGenSettings.tutor_mode = !!tutorModeForTurn;
  if (providerSort) appliedGenSettings.providerSort = providerSort;

  const replacement: Message = {
    id: original.id,
    chatId,
    role: 'assistant',
    content: '',
    createdAt: original.createdAt,
    model: modelIdForTurn,
    reasoning: '',
    attachments: [],
    systemSnapshot,
    genSettings: appliedGenSettings,
  } as Message;

  set((state) => ({
    messages: {
      ...state.messages,
      [chatId]: (state.messages[chatId] ?? []).map((entry) =>
        entry.id === original.id ? replacement : entry,
      ),
    },
    ui: { ...state.ui, isStreaming: true },
  }));
  setTurnController(chatId, controller);

  const plugins = composePlugins({
    hasPdf: hadPdfEarlier,
    searchEnabled: searchWithBrave,
    searchProvider: searchProvider || 'openrouter',
  });

  const nextSettings: Chat['settings'] = { ...chat.settings, model: modelIdForTurn };
  if (typeof temperature === 'number') nextSettings.temperature = temperature;
  if (typeof topP === 'number') nextSettings.top_p = topP;
  if (typeof maxTokens === 'number') nextSettings.max_tokens = maxTokens;
  if (supportsReasoning && typeof reasoningEffort === 'string')
    nextSettings.reasoning_effort = reasoningEffort;
  if (supportsReasoning && typeof reasoningTokens === 'number')
    nextSettings.reasoning_tokens = reasoningTokens;
  nextSettings.search_with_brave = !!searchWithBrave;
  if (searchProvider) nextSettings.search_provider = searchProvider;
  nextSettings.tutor_mode = !!tutorModeForTurn;

  const chatForStream: Chat = { ...chat, settings: nextSettings };

  await streamFinal({
    chat: chatForStream,
    chatId,
    assistantMessage: replacement,
    messages: convo,
    controller,
    apiKey,
    providerSort: providerSort ?? undefined,
    set,
    get,
    models,
    modelIndex,
    persistMessage,
    plugins,
    toolDefinition: undefined,
    startBuffered: false,
  });
}

export function __setOpenRouterMocksForTests(overrides?: {
  chatCompletion?: typeof chatCompletion;
  streamChatCompletion?: typeof streamChatCompletion;
}) {
  chatCompletionImpl = overrides?.chatCompletion ?? chatCompletion;
  streamChatCompletionImpl = overrides?.streamChatCompletion ?? streamChatCompletion;
}
