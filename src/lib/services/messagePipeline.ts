// Module: services/messagePipeline
// Responsibility: Encapsulate planning and streaming flows for assistant turns.

import { chatCompletion, streamChatCompletion } from '@/lib/openrouter';
import {
  buildDebugBody,
  composePlugins,
  maybeRecordDebug,
  type ProviderSort,
} from '@/lib/agent/request';
import { createMessageStreamCallbacks } from '@/lib/agent/streamHandlers';
import { applyTutorToolCall, extractTutorToolCalls, extractWebSearchArgs } from '@/lib/agent/tools';
import {
  formatSourcesBlock,
  mergeSearchResults,
  runBraveSearch,
  updateBraveUi,
  type SearchResult,
} from '@/lib/agent/searchFlow';
import { MAX_FALLBACK_RESULTS } from '@/lib/constants';
import { isToolCallingSupported } from '@/lib/models';
import type { ModelIndex } from '@/lib/models';
import { buildChatCompletionMessages } from '@/lib/agent/conversation';
import type { StoreState } from '@/lib/store/types';
import type { Chat, Message, ORModel } from '@/lib/types';

let chatCompletionImpl = chatCompletion;
let streamChatCompletionImpl = streamChatCompletion;

export type StoreSetter = (updater: (state: StoreState) => Partial<StoreState> | void) => void;
export type StoreGetter = () => StoreState;
export type PersistMessage = (message: Message) => Promise<void>;

export type PlanTurnOptions = {
  chat: Chat;
  chatId: string;
  assistantMessage: Message;
  userContent: string;
  combinedSystem?: string;
  baseMessages: any[];
  toolDefinition: any[];
  searchEnabled: boolean;
  searchProvider: 'brave' | 'openrouter';
  providerSort: ProviderSort;
  apiKey: string;
  controller: AbortController;
  set: StoreSetter;
  get: StoreGetter;
  models: ORModel[];
  modelIndex: ModelIndex;
  persistMessage: PersistMessage;
};

export type PlanTurnResult = {
  finalSystem: string;
  usedTutorContentTool: boolean;
  hasSearchResults: boolean;
};

export async function executeWebSearch(opts: {
  args: Record<string, any>;
  userContent: string;
  searchProvider: 'brave' | 'openrouter';
  controller: AbortController;
  assistantMessageId: string;
  chatId: string;
  set: StoreSetter;
}): Promise<{ ok: boolean; results: SearchResult[]; error?: string; query: string }> {
  const { args, userContent, searchProvider, controller, assistantMessageId, chatId, set } = opts;
  let rawQuery = String(args?.query || '').trim();
  const count = Math.min(Math.max(parseInt(String(args?.count || '5'), 10) || 5, 1), 10);
  if (!rawQuery) rawQuery = userContent.trim().slice(0, 256);

  if (searchProvider === 'brave') {
    updateBraveUi(set, assistantMessageId, { query: rawQuery, status: 'loading' });
  }

  try {
    const fetchController = new AbortController();
    const onAbort = () => fetchController.abort();
    controller.signal.addEventListener('abort', onAbort);
    const timeout = setTimeout(() => fetchController.abort(), 20000);
    const result =
      searchProvider === 'brave'
        ? await runBraveSearch(rawQuery, count, { signal: fetchController.signal })
        : { ok: false, results: [] as SearchResult[], error: undefined };
    clearTimeout(timeout);
    controller.signal.removeEventListener('abort', onAbort);

    if (result.ok) {
      if (searchProvider === 'brave')
        updateBraveUi(set, assistantMessageId, {
          query: rawQuery,
          status: 'done',
          results: result.results,
        });
      return { ok: true, results: result.results, query: rawQuery };
    }

    if (searchProvider === 'brave')
      updateBraveUi(set, assistantMessageId, {
        query: rawQuery,
        status: 'error',
        results: [],
        error: result.error || 'No results',
      });
    if (result.error === 'Missing BRAVE_SEARCH_API_KEY')
      set((state) => ({ ui: { ...state.ui, notice: 'Missing BRAVE_SEARCH_API_KEY' } }));
    return { ok: false, results: [], error: result.error, query: rawQuery };
  } catch (err: any) {
    if (searchProvider === 'brave')
      updateBraveUi(set, assistantMessageId, {
        query: rawQuery,
        status: 'error',
        results: [],
        error: err?.message || 'Network error',
      });
    return { ok: false, results: [], error: err?.message, query: rawQuery };
  }
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

  const planningSystem = combinedSystem
    ? ({ role: 'system', content: combinedSystem } as const)
    : undefined;
  const planningMessages: any[] = planningSystem
    ? [planningSystem, ...baseMessages.filter((m) => m.role !== 'system')]
    : baseMessages.slice();
  let convo = planningMessages.slice();
  let rounds = 0;
  let usedTool = false;
  let usedTutorContentTool = false;
  let aggregatedResults: SearchResult[] = [];

  while (rounds < 3) {
    const modelMeta = modelIndex.get(chat.settings.model);
    const caps = modelIndex.caps(chat.settings.model);
    const supportsReasoning = caps.canReason;
    const supportsTools = isToolCallingSupported(modelMeta);
    try {
      const dbg = buildDebugBody({
        modelId: chat.settings.model,
        messages: convo as any,
        stream: false,
        temperature: chat.settings.temperature,
        top_p: chat.settings.top_p,
        max_tokens: chat.settings.max_tokens,
        reasoningEffort: supportsReasoning ? chat.settings.reasoning_effort : undefined,
        reasoningTokens: supportsReasoning ? chat.settings.reasoning_tokens : undefined,
        tools: supportsTools ? (toolDefinition as any) : undefined,
        toolChoice: supportsTools ? 'auto' : undefined,
        providerSort,
      });
      maybeRecordDebug({ set, get }, assistantMessage.id, dbg);
    } catch {}

    const resp = await chatCompletionImpl({
      apiKey,
      model: chat.settings.model,
      messages: convo as any,
      temperature: chat.settings.temperature,
      top_p: chat.settings.top_p,
      max_tokens: chat.settings.max_tokens,
      reasoning_effort: supportsReasoning ? chat.settings.reasoning_effort : undefined,
      reasoning_tokens: supportsReasoning ? chat.settings.reasoning_tokens : undefined,
      tools: supportsTools ? (toolDefinition as any) : undefined,
      tool_choice: supportsTools ? ('auto' as any) : undefined,
      signal: controller.signal,
      providerSort,
      plugins: undefined,
    });

    const choice = resp?.choices?.[0];
    const message = choice?.message || {};
    let toolCalls =
      Array.isArray(message?.tool_calls) && message.tool_calls.length > 0
        ? message.tool_calls
        : message?.function_call
          ? [
              {
                id: 'call_0',
                type: 'function',
                function: {
                  name: message.function_call.name,
                  arguments: message.function_call.arguments,
                },
              },
            ]
          : [];

    if ((!toolCalls || toolCalls.length === 0) && typeof message?.content === 'string') {
      const inline = extractWebSearchArgs(message.content);
      if (inline) {
        toolCalls = [
          {
            id: 'call_0',
            type: 'function',
            function: { name: 'web_search', arguments: JSON.stringify(inline) },
          },
        ];
      } else {
        const tutorCalls = extractTutorToolCalls(message.content);
        if (tutorCalls.length > 0) {
          toolCalls = tutorCalls.map((c, idx) => ({
            id: `inline_${idx}`,
            type: 'function',
            function: { name: c.name, arguments: JSON.stringify(c.args) },
          }));
        }
      }
    }

    if (toolCalls && toolCalls.length > 0) {
      usedTool = true;
      convo.push({ role: 'assistant', content: null, tool_calls: toolCalls } as any);
    }

    if (!toolCalls || toolCalls.length === 0) {
      break;
    }

    for (const tc of toolCalls) {
      const name = tc?.function?.name as string;
      let args: any = {};
      try {
        const rawArgs = (tc?.function as any)?.arguments;
        if (typeof rawArgs === 'string') args = JSON.parse(rawArgs || '{}');
        else if (rawArgs && typeof rawArgs === 'object') args = rawArgs;
      } catch {}

      if (name === 'web_search') {
        const searchResult = await executeWebSearch({
          args,
          userContent,
          searchProvider,
          controller,
          assistantMessageId: assistantMessage.id,
          chatId,
          set,
        });
        if (searchResult.ok) {
          aggregatedResults = mergeSearchResults([
            Array.isArray(aggregatedResults) ? aggregatedResults : [],
            searchResult.results,
          ]);
          const jsonPayload = JSON.stringify(
            searchResult.results.slice(0, MAX_FALLBACK_RESULTS).map((r) => ({
              title: r?.title,
              url: r?.url,
              description: r?.description,
            })),
          );
          convo.push({
            role: 'tool',
            name: 'web_search',
            tool_call_id: tc.id,
            content: jsonPayload,
          } as any);
        } else {
          if (searchResult.error === 'Missing BRAVE_SEARCH_API_KEY')
            set((state) => ({ ui: { ...state.ui, notice: 'Missing BRAVE_SEARCH_API_KEY' } }));
          convo.push({
            role: 'tool',
            name: 'web_search',
            tool_call_id: tc.id,
            content: 'No results',
          } as any);
        }
        usedTool = true;
        continue;
      }

      const tutorOutcome = await applyTutorToolCall({
        name,
        args,
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
            name,
            tool_call_id: tc.id,
            content: tutorOutcome.payload,
          } as any);
        }
        usedTool = true;
      }
    }

    const followup =
      searchEnabled && searchProvider === 'brave'
        ? 'Write the final answer. Cite sources inline as [n].'
        : 'Continue the lesson concisely. Give brief guidance and next step. Do not repeat items already rendered.';
    convo.push({ role: 'user', content: followup } as any);
    rounds += 1;
  }

  const baseSystem = combinedSystem || chat.settings.system || 'You are a helpful assistant.';
  const sourcesBlock =
    usedTool && Array.isArray(aggregatedResults) && aggregatedResults.length > 0
      ? formatSourcesBlock(aggregatedResults, searchProvider)
      : '';
  const finalSystem = `${baseSystem}${sourcesBlock}`;
  return {
    finalSystem,
    usedTutorContentTool,
    hasSearchResults: Array.isArray(aggregatedResults) && aggregatedResults.length > 0,
  };
}

export type StreamFinalOptions = {
  chat: Chat;
  chatId: string;
  assistantMessage: Message;
  messages: any[];
  controller: AbortController;
  apiKey: string;
  providerSort: ProviderSort;
  set: StoreSetter;
  get: StoreGetter;
  models: ORModel[];
  modelIndex: ModelIndex;
  persistMessage: PersistMessage;
  plugins?: any[];
  toolDefinition?: any[];
  startBuffered: boolean;
};

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
      tools: includeTools ? (toolDefinition as any) : undefined,
      toolChoice: includeTools ? 'none' : undefined,
      providerSort,
      plugins: combinedPlugins,
    });
    maybeRecordDebug({ set, get }, assistantMessage.id, dbg);
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
      clearController: () => set((state) => ({ ...state, _controller: undefined }) as any),
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
    tools: includeTools ? (toolDefinition as any) : undefined,
    tool_choice: includeTools ? ('none' as any) : undefined,
    providerSort,
    plugins: combinedPlugins,
    callbacks,
  });
}

export type RegenerateOptions = {
  chat: Chat;
  chatId: string;
  targetMessageId: string;
  messages: Message[];
  models: ORModel[];
  modelIndex: ModelIndex;
  apiKey: string;
  controller: AbortController;
  set: StoreSetter;
  get: StoreGetter;
  persistMessage: PersistMessage;
  overrideModelId?: string;
};

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
  ): 'brave' | 'openrouter' | undefined => {
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
  const providerSortSnapshot = snapshotSettings?.providerSort;
  const providerSort: ProviderSort | undefined =
    providerSortSnapshot === 'price' || providerSortSnapshot === 'throughput'
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
  set((state) => ({ ...state, _controller: controller as any }) as any);

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
