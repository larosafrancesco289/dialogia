// Module: services/messagePipeline
// Responsibility: Encapsulate planning and streaming flows for assistant turns.

import { chatCompletion, streamChatCompletion } from '@/lib/openrouter';
import { buildDebugBody, type ProviderSort } from '@/lib/agent/request';
import { createMessageStreamCallbacks } from '@/lib/agent/streamHandlers';
import {
  extractTutorToolCalls,
  extractWebSearchArgs,
  normalizeTutorQuizPayload,
} from '@/lib/agent/tools';
import {
  formatSourcesBlock,
  mergeSearchResults,
  runBraveSearch,
  type SearchResult,
} from '@/lib/agent/searchFlow';
import { MAX_FALLBACK_RESULTS } from '@/lib/constants';
import {
  findModelById,
  isImageOutputSupported,
  isReasoningSupported,
  isToolCallingSupported,
} from '@/lib/models';
import { addCardsToDeck, getDueCards } from '@/lib/tutorDeck';
import { attachTutorUiState } from '@/lib/agent/tutorFlow';
import type { StoreState } from '@/lib/store/types';
import type { Chat, Message, ORModel } from '@/lib/types';

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
  persistMessage: PersistMessage;
};

export type PlanTurnResult = {
  finalSystem: string;
  usedTutorContentTool: boolean;
  hasSearchResults: boolean;
};

export async function applyTutorToolCall(opts: {
  name: string;
  args: any;
  chat: Chat;
  chatId: string;
  assistantMessage: Message;
  set: StoreSetter;
  persistMessage: PersistMessage;
}): Promise<{ handled: boolean; usedContent: boolean; payload?: string }> {
  const { name, args, chat, chatId, assistantMessage, set, persistMessage } = opts;

  const patchForItems = async (mapKey: string) => {
    const normalized = normalizeTutorQuizPayload(args);
    if (!normalized) return { handled: false, usedContent: false } as const;
    let updatedMsg: Message | undefined;
    set((state) => {
      const keyId = assistantMessage.id;
      const prevUi = (state.ui.tutorByMessageId || {})[keyId] || {};
      const patch = {
        title: prevUi.title || args?.title,
        [mapKey]: [...(((prevUi as any)[mapKey] as any[]) || []), ...normalized.items],
      } as Record<string, any>;
      const list = state.messages[chatId] ?? [];
      const result = attachTutorUiState({
        currentUi: state.ui.tutorByMessageId,
        currentMessages: list,
        messageId: keyId,
        patch,
      });
      if (result.updatedMessage) updatedMsg = result.updatedMessage;
      return {
        ui: { ...state.ui, tutorByMessageId: result.nextUi },
        messages: { ...state.messages, [chatId]: result.nextMessages },
      } as Partial<StoreState>;
    });
    if (updatedMsg) {
      try {
        await persistMessage(updatedMsg);
      } catch {}
    }
    try {
      const body: any = { items: normalized.items };
      if (typeof args?.title === 'string') body.title = args.title;
      return { handled: true, usedContent: true, payload: JSON.stringify(body) } as const;
    } catch {}
    return { handled: true, usedContent: true } as const;
  };

  if (name === 'quiz_mcq') return patchForItems('mcq');
  if (name === 'quiz_fill_blank') return patchForItems('fillBlank');
  if (name === 'quiz_open_ended') return patchForItems('openEnded');
  if (name === 'flashcards') return patchForItems('flashcards');

  if (name === 'grade_open_response') {
    const rawId = args?.item_id;
    const itemId = (() => {
      const s = typeof rawId === 'string' ? rawId.trim() : '';
      if (!s || s === 'null' || s === 'undefined') return '';
      return s;
    })();
    const feedback = String(args?.feedback || '').trim();
    const score = typeof args?.score === 'number' ? args.score : undefined;
    const criteria = Array.isArray(args?.criteria) ? args.criteria : undefined;
    if (!itemId || !feedback) return { handled: false, usedContent: false };
    let updatedMsg: Message | undefined;
    set((state) => {
      const list = state.messages[chatId] ?? [];
      const target = list.find((m) => m.id === assistantMessage.id);
      const existingTutor = (target as any)?.tutor || {};
      const patch = {
        grading: {
          ...(existingTutor.grading || {}),
          [itemId]: { feedback, score, criteria },
        },
      } as Record<string, any>;
      const result = attachTutorUiState({
        currentUi: state.ui.tutorByMessageId,
        currentMessages: list,
        messageId: assistantMessage.id,
        patch,
      });
      if (result.updatedMessage) updatedMsg = result.updatedMessage;
      return {
        ui: { ...state.ui, tutorByMessageId: result.nextUi },
        messages: { ...state.messages, [chatId]: result.nextMessages },
      } as Partial<StoreState>;
    });
    if (updatedMsg) {
      try {
        await persistMessage(updatedMsg);
      } catch {}
    }
    return { handled: true, usedContent: false };
  }

  if (name === 'add_to_deck') {
    try {
      const cards = Array.isArray(args?.cards) ? args.cards : [];
      if (cards.length > 0) await addCardsToDeck(chat.id, cards);
    } catch {}
    return { handled: true, usedContent: false };
  }

  if (name === 'srs_review') {
    const cnt = Math.min(Math.max(parseInt(String(args?.due_count || '10'), 10) || 10, 1), 40);
    let due: any[] = [];
    try {
      const cards = await getDueCards(chat.id, cnt);
      due = cards.map((c) => ({
        id: c.id,
        front: c.front,
        back: c.back,
        hint: c.hint,
        topic: c.topic,
        skill: c.skill,
      }));
    } catch {}
    return { handled: true, usedContent: false, payload: JSON.stringify(due) };
  }

  return { handled: false, usedContent: false };
}

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
    set((state) => ({
      ui: {
        ...state.ui,
        braveByMessageId: {
          ...(state.ui.braveByMessageId || {}),
          [assistantMessageId]: { query: rawQuery, status: 'loading' },
        },
      },
    }));
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
        set((state) => ({
          ui: {
            ...state.ui,
            braveByMessageId: {
              ...(state.ui.braveByMessageId || {}),
              [assistantMessageId]: {
                query: rawQuery,
                status: 'done',
                results: result.results,
              },
            },
          },
        }));
      return { ok: true, results: result.results, query: rawQuery };
    }

    if (searchProvider === 'brave')
      set((state) => ({
        ui: {
          ...state.ui,
          braveByMessageId: {
            ...(state.ui.braveByMessageId || {}),
            [assistantMessageId]: {
              query: rawQuery,
              status: 'error',
              results: [],
              error: result.error || 'No results',
            },
          },
        },
      }));
    if (result.error === 'Missing BRAVE_SEARCH_API_KEY')
      set((state) => ({ ui: { ...state.ui, notice: 'Missing BRAVE_SEARCH_API_KEY' } }));
    return { ok: false, results: [], error: result.error, query: rawQuery };
  } catch (err: any) {
    if (searchProvider === 'brave')
      set((state) => ({
        ui: {
          ...state.ui,
          braveByMessageId: {
            ...(state.ui.braveByMessageId || {}),
            [assistantMessageId]: {
              query: rawQuery,
              status: 'error',
              results: [],
              error: err?.message || 'Network error',
            },
          },
        },
      }));
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

  const applyTutorItems = async (
    variant: 'quiz_mcq' | 'quiz_fill_blank' | 'quiz_open_ended' | 'flashcards',
    args: any,
  ) => {
    const normalized = normalizeTutorQuizPayload(args);
    if (!normalized) return { ok: false } as const;
    let updatedMsg: Message | undefined;
    set((state) => {
      const keyId = assistantMessage.id;
      const prevUi = (state.ui.tutorByMessageId || {})[keyId] || {};
      const mapKey =
        variant === 'quiz_mcq'
          ? 'mcq'
          : variant === 'quiz_fill_blank'
            ? 'fillBlank'
            : variant === 'quiz_open_ended'
              ? 'openEnded'
              : 'flashcards';
      const patch = {
        title: prevUi.title || args?.title,
        [mapKey]: [...(((prevUi as any)[mapKey] as any[]) || []), ...normalized.items],
      } as Record<string, any>;
      const list = state.messages[chatId] ?? [];
      const result = attachTutorUiState({
        currentUi: state.ui.tutorByMessageId,
        currentMessages: list,
        messageId: keyId,
        patch,
      });
      if (result.updatedMessage) updatedMsg = result.updatedMessage;
      return {
        ui: { ...state.ui, tutorByMessageId: result.nextUi },
        messages: { ...state.messages, [chatId]: result.nextMessages },
      } as Partial<StoreState>;
    });
    if (updatedMsg) {
      try {
        await persistMessage(updatedMsg);
      } catch {}
    }
    try {
      const body: any = { items: normalized.items };
      if (typeof args?.title === 'string') body.title = args.title;
      return { ok: true, json: JSON.stringify(body) } as const;
    } catch {}
    return { ok: true } as const;
  };

  while (rounds < 3) {
    const modelMeta = findModelById(models, chat.settings.model);
    const supportsReasoning = isReasoningSupported(modelMeta);
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
      if (get().ui.debugMode) {
        set((state) => ({
          ui: {
            ...state.ui,
            debugByMessageId: {
              ...(state.ui.debugByMessageId || {}),
              [assistantMessage.id]: {
                body: JSON.stringify(dbg, null, 2),
                createdAt: Date.now(),
              },
            },
          },
        }));
      }
    } catch {}

    const resp = await chatCompletion({
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
  persistMessage: PersistMessage;
  basePlugins?: any[];
  searchEnabled: boolean;
  searchProvider: 'brave' | 'openrouter';
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
    persistMessage,
    basePlugins,
    searchEnabled,
    searchProvider,
    toolDefinition,
    startBuffered,
  } = opts;

  const modelMeta = findModelById(models, chat.settings.model);
  const supportsReasoning = isReasoningSupported(modelMeta);
  const canImageOut = isImageOutputSupported(modelMeta);
  const supportsTools = isToolCallingSupported(modelMeta);
  const includeTools = supportsTools && Array.isArray(toolDefinition) && toolDefinition.length > 0;
  const combinedPlugins = (() => {
    const arr: any[] = [];
    if (Array.isArray(basePlugins) && basePlugins.length > 0) arr.push(...basePlugins);
    if (searchEnabled && searchProvider === 'openrouter') arr.push({ id: 'web' });
    return arr.length > 0 ? arr : undefined;
  })();

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
    if (get().ui.debugMode) {
      set((state) => ({
        ui: {
          ...state.ui,
          debugByMessageId: {
            ...(state.ui.debugByMessageId || {}),
            [assistantMessage.id]: {
              body: JSON.stringify(dbg, null, 2),
              createdAt: Date.now(),
            },
          },
        },
      }));
    }
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

  await streamChatCompletion({
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
