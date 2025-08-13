'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { db, saveChat, saveMessage } from '@/lib/db';
import type { Chat, ChatSettings, Message, ORModel } from '@/lib/types';
// crypto helpers are available in `@/lib/crypto` if encrypted storage is added later
import { fetchModels, streamChatCompletion, chatCompletion } from '@/lib/openrouter';

type StorageMode = 'memory' | 'encrypted';

type UIState = {
  showSettings: boolean;
  isStreaming: boolean;
  notice?: string;
  sidebarCollapsed?: boolean;
  nextModel?: string;
  // Pre-chat preference applied to the next created chat
  nextSearchWithBrave?: boolean;
  // Ephemeral UI for Brave search experience, keyed by assistant message id
  braveByMessageId?: Record<
    string,
    {
      query: string;
      status: 'loading' | 'done' | 'error';
      results?: { title?: string; url?: string; description?: string }[];
      error?: string;
    }
  >;
};

type StoreState = {
  chats: Chat[];
  messages: Record<string, Message[]>; // chatId -> messages
  selectedChatId?: string;

  models: ORModel[];
  favoriteModelIds: string[];
  hiddenModelIds: string[];

  ui: UIState;

  initializeApp: () => Promise<void>;
  newChat: () => Promise<void>;
  selectChat: (id: string) => void;
  renameChat: (id: string, title: string) => Promise<void>;
  deleteChat: (id: string) => Promise<void>;
  updateChatSettings: (partial: Partial<ChatSettings>) => Promise<void>;
  setUI: (partial: Partial<UIState>) => void;

  loadModels: (opts?: { showErrors?: boolean }) => Promise<void>;
  toggleFavoriteModel: (id: string) => void;
  hideModel: (id: string) => void;
  unhideModel: (id: string) => void;
  resetHiddenModels: () => void;
  removeModelFromDropdown: (id: string) => void;

  sendUserMessage: (content: string) => Promise<void>;
  stopStreaming: () => void;
  regenerateAssistantMessage: (messageId: string, opts?: { modelId?: string }) => Promise<void>;
};

const defaultSettings: ChatSettings = {
  model: 'openai/gpt-5-chat',
  // temperature/top_p/max_tokens omitted by default; OpenRouter will use model defaults
  system: 'You are a helpful assistant.',
  reasoning_effort: undefined,
  show_thinking_by_default: true,
  show_stats: true,
  search_with_brave: false,
};

export const useChatStore = create<StoreState>()(
  persist(
    (set, get) => ({
      chats: [],
      messages: {},
      selectedChatId: undefined,
      models: [],
      favoriteModelIds: [],
      hiddenModelIds: [],
      ui: {
        showSettings: false,
        isStreaming: false,
        sidebarCollapsed: false,
        nextSearchWithBrave: false,
        braveByMessageId: {},
      },
      _controller: undefined as AbortController | undefined,

      initializeApp: async () => {
        const compareMessages = (a: Message, b: Message) => {
          if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
          const rolePriority: Record<Message['role'], number> = {
            system: 0,
            user: 1,
            assistant: 2,
          };
          if (rolePriority[a.role] !== rolePriority[b.role])
            return rolePriority[a.role] - rolePriority[b.role];
          return a.id.localeCompare(b.id);
        };
        const chats = await db.chats.toArray();
        const messagesArray = await db.messages.toArray();
        const messages: Record<string, Message[]> = {};
        for (const m of messagesArray) {
          if (!messages[m.chatId]) messages[m.chatId] = [];
          messages[m.chatId].push(m);
        }
        // Ensure consistent chronological ordering for each chat
        for (const key of Object.keys(messages)) {
          messages[key] = messages[key].slice().sort(compareMessages);
        }
        let selectedChatId = get().selectedChatId;
        if (chats.length && !selectedChatId) {
          selectedChatId = chats[0].id;
        }
        set({ chats, messages, selectedChatId });
      },

      newChat: async () => {
        const id = uuidv4();
        const now = Date.now();
        const chat: Chat = {
          id,
          title: 'New Chat',
          createdAt: now,
          updatedAt: now,
          settings: {
            ...defaultSettings,
            model: get().ui.nextModel ?? defaultSettings.model,
            search_with_brave:
              get().ui.nextSearchWithBrave ?? defaultSettings.search_with_brave ?? false,
          },
        };
        await saveChat(chat);
        set((s) => ({ chats: [chat, ...s.chats], selectedChatId: id }));
      },
      selectChat: (id) => set({ selectedChatId: id }),
      renameChat: async (id, title) => {
        set((s) => ({
          chats: s.chats.map((c) => (c.id === id ? { ...c, title, updatedAt: Date.now() } : c)),
        }));
        const chat = get().chats.find((c) => c.id === id)!;
        await saveChat(chat);
      },
      deleteChat: async (id) => {
        await db.transaction('rw', db.chats, db.messages, async () => {
          await db.chats.delete(id);
          await db.messages.where({ chatId: id }).delete();
        });
        set((s) => {
          const chats = s.chats.filter((c) => c.id !== id);
          const selectedChatId = s.selectedChatId === id ? chats[0]?.id : s.selectedChatId;
          const { [id]: _, ...rest } = s.messages;
          return { chats, messages: rest, selectedChatId };
        });
      },
      updateChatSettings: async (partial) => {
        const id = get().selectedChatId;
        if (!id) return;
        set((s) => ({
          chats: s.chats.map((c) =>
            c.id === id
              ? { ...c, settings: { ...c.settings, ...partial }, updatedAt: Date.now() }
              : c,
          ),
        }));
        const chat = get().chats.find((c) => c.id === id)!;
        await saveChat(chat);
      },
      setUI: (partial) => set((s) => ({ ui: { ...s.ui, ...partial } })),

      loadModels: async () => {
        const key = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY as string | undefined;
        if (!key)
          return set((s) => ({
            ui: { ...s.ui, notice: 'Missing NEXT_PUBLIC_OPENROUTER_API_KEY in .env' },
          }));
        try {
          const models = await fetchModels(key);
          set({ models });
        } catch (e: any) {
          if (e?.message === 'unauthorized')
            set((s) => ({ ui: { ...s.ui, notice: 'Invalid API key' } }));
        }
      },
      toggleFavoriteModel: (id) =>
        set((s) => ({
          favoriteModelIds: s.favoriteModelIds.includes(id)
            ? s.favoriteModelIds.filter((m) => m !== id)
            : [id, ...s.favoriteModelIds],
        })),

      hideModel: (id) =>
        set((s) => {
          const PINNED_MODEL_ID = 'openai/gpt-5-chat';
          if (id === PINNED_MODEL_ID) return {};
          return {
            hiddenModelIds: s.hiddenModelIds.includes(id)
              ? s.hiddenModelIds
              : [id, ...s.hiddenModelIds],
          };
        }),

      unhideModel: (id) =>
        set((s) => ({ hiddenModelIds: s.hiddenModelIds.filter((m) => m !== id) })),

      resetHiddenModels: () => set({ hiddenModelIds: [] }),

      removeModelFromDropdown: (id) =>
        set((s) => {
          const PINNED_MODEL_ID = 'openai/gpt-5-chat';
          if (id === PINNED_MODEL_ID) return {};
          const isFavorite = s.favoriteModelIds.includes(id);
          if (isFavorite) {
            return { favoriteModelIds: s.favoriteModelIds.filter((m) => m !== id) };
          }
          if (s.hiddenModelIds.includes(id)) return {};
          return { hiddenModelIds: [id, ...s.hiddenModelIds] };
        }),

      sendUserMessage: async (content: string) => {
        const key = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY as string | undefined;
        if (!key)
          return set((s) => ({
            ui: { ...s.ui, notice: 'Missing NEXT_PUBLIC_OPENROUTER_API_KEY in .env' },
          }));
        const chatId = get().selectedChatId!;
        const chat = get().chats.find((c) => c.id === chatId)!;
        const now = Date.now();
        const userMsg: Message = {
          id: uuidv4(),
          chatId,
          role: 'user',
          content,
          createdAt: now,
        };
        const assistantMsg: Message = {
          id: uuidv4(),
          chatId,
          role: 'assistant',
          content: '',
          // Ensure assistant message sorts after the user message even if timestamps are equal
          createdAt: now + 1,
          model: chat.settings.model,
          reasoning: '',
        };
        // Capture messages before adding the new pair so we can build the prompt correctly
        const priorList = get().messages[chatId] ?? [];
        // Push user and assistant placeholders immediately so the UI shows activity
        set((s) => ({
          messages: {
            ...s.messages,
            [chatId]: [...(s.messages[chatId] ?? []), userMsg, assistantMsg],
          },
          ui: { ...s.ui, isStreaming: true },
        }));
        await saveMessage(userMsg);
        await saveMessage(assistantMsg);
        // Determine if the user is asking about capabilities (e.g., "can you search the web?")
        // In that case, we avoid tool-use and any legacy augmentation.
        const isCapabilityQuery = false; // legacy disabled: tool-use only when model calls it itself
        // Optionally prefetch Brave Search results for this user query and attach to UI state.
        // We no longer inject results into the user prompt here; instead, we let the model
        // decide via tool-use, with this prefetch serving as a fast path cache.
        // No prefetch: only fetch Brave results if the model explicitly calls the tool.

        // Build the LLM payload using prior conversation (captured before appending)
        // and the new user message. Tool-use (if enabled) may extend this before generation.
        const msgs = buildChatCompletionMessages({
          chat,
          priorMessages: priorList,
          models: get().models,
          newUserContent: content,
        });
        // auto-name chat if default title
        if (chat.title === 'New Chat') {
          const draft = content.trim().slice(0, 40);
          await get().renameChat(chat.id, draft || 'New Chat');
        }

        // Decide path: if Brave tool is enabled, let the model attempt tool-use first (non-streaming);
        // if no tool calls are used, fall back to the streaming flow.
        const attemptToolUse = !!chat.settings.search_with_brave;
        // Prepare tool instruction text and a combined system message for this turn
        const toolPreambleText =
          'You have access to a function tool named "web_search" that retrieves up-to-date web results.\n\nWhen you need current, factual, or source-backed information, call the tool first. If you call a tool, respond with ONLY tool_calls (no user-facing text). After the tool returns, write the final answer that cites sources inline as [n] using the numbering provided.\n\nweb_search(args): { query: string, count?: integer 1-10 }. Choose a focused query and a small count, and avoid unnecessary calls.';
        const combinedSystemForThisTurn = attemptToolUse
          ? (
              (chat.settings.system && chat.settings.system.trim())
                ? `${toolPreambleText}\n\n${chat.settings.system}`
                : toolPreambleText
            )
          : undefined;
        if (attemptToolUse) {
          try {
            const controller = new AbortController();
            set((s) => ({ ...s, _controller: controller as any }) as any);
            const toolDefinition = [
              {
                type: 'function',
                function: {
                  name: 'web_search',
                  description:
                    'Search the public web for up-to-date information. Use only when necessary. Return results to ground your answer and cite sources as [n].',
                  parameters: {
                    type: 'object',
                    properties: {
                      query: { type: 'string', description: 'The search query to run.' },
                      count: {
                        type: 'integer',
                        description: 'How many results to retrieve (1-10).',
                        minimum: 1,
                        maximum: 10,
                      },
                    },
                    required: ['query'],
                  },
                },
              },
            ];
            // First planning call allowing tools
            // Provide a single system message combining tool instructions and any user-configured system prompt
            const planningSystem = { role: 'system', content: combinedSystemForThisTurn! } as const;
            const planningMessages: any[] = [planningSystem, ...msgs.filter((m) => m.role !== 'system')];
            let convo = planningMessages.slice();
            let calls = 0; // executed tool calls
            let rounds = 0; // assistant response rounds
            let firstTurn = true;
            let finalContent: string | null = null;
            let finalUsage: any | undefined = undefined;

            const extractInlineWebSearchArgs = (text: string): { query: string; count?: number } | null => {
              try {
                const candidates: Array<Record<string, any>> = [];
                const jsonMatches = text.match(/\{[\s\S]*?\}/g) || [];
                for (const m of jsonMatches) {
                  try {
                    const obj = JSON.parse(m);
                    candidates.push(obj);
                  } catch {}
                }
                for (const c of candidates) {
                  if (typeof c.query === 'string') {
                    const q = String(c.query).trim();
                    if (q) {
                      const cnt = Number.isFinite(c.count) ? Math.max(1, Math.min(10, Math.floor(c.count))) : undefined;
                      return { query: q, count: cnt };
                    }
                  }
                  if (typeof c.name === 'string' && c.name === 'web_search') {
                    const arg = c.arguments;
                    if (typeof arg === 'string') {
                      try {
                        const inner = JSON.parse(arg);
                        if (inner && typeof inner.query === 'string' && inner.query.trim()) {
                          const cnt = Number.isFinite(inner.count) ? Math.max(1, Math.min(10, Math.floor(inner.count))) : undefined;
                          return { query: inner.query.trim(), count: cnt };
                        }
                      } catch {}
                    } else if (arg && typeof arg === 'object' && typeof arg.query === 'string') {
                      const q = String(arg.query).trim();
                      if (q) {
                        const cnt = Number.isFinite(arg.count) ? Math.max(1, Math.min(10, Math.floor(arg.count))) : undefined;
                        return { query: q, count: cnt };
                      }
                    }
                  }
                }
              } catch {}
              return null;
            };

            while (rounds < 3) {
              const resp = await chatCompletion({
                apiKey: key,
                model: chat.settings.model,
                messages: convo as any,
                temperature: chat.settings.temperature,
                top_p: chat.settings.top_p,
                max_tokens: chat.settings.max_tokens,
                reasoning_effort: chat.settings.reasoning_effort,
                reasoning_tokens: chat.settings.reasoning_tokens,
                tools: toolDefinition as any,
                // Force the very first request to produce a web_search tool call when enabled
                tool_choice: firstTurn ? ({ type: 'function', function: { name: 'web_search' } } as any) : 'auto',
                signal: controller.signal,
              });
              finalUsage = resp?.usage;
              const choice = resp?.choices?.[0];
              const message = choice?.message || {};
              let toolCalls = Array.isArray(message?.tool_calls) && message.tool_calls.length > 0
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
              // If the provider returned the tool call inline as text, try to parse it
              if ((!toolCalls || toolCalls.length === 0) && typeof message?.content === 'string') {
                const inline = extractInlineWebSearchArgs(message.content);
                if (inline) {
                  toolCalls = [
                    {
                      id: 'call_0',
                      type: 'function',
                      function: { name: 'web_search', arguments: JSON.stringify(inline) },
                    },
                  ];
                }
              }
              // Keep the assistant tool-call message in the conversation so the model can use the results.
              // When tool_calls are present, set content to null to avoid leaking JSON into the transcript.
              if (toolCalls && toolCalls.length > 0) {
                convo.push({ role: 'assistant', content: null, tool_calls: toolCalls } as any);
              }
              // If we forced a tool call but the model didn't provide args, synthesize a reasonable default
              if (firstTurn && (!toolCalls || toolCalls.length === 0)) {
                toolCalls = [
                  {
                    id: 'call_0',
                    type: 'function',
                    function: {
                      name: 'web_search',
                      arguments: JSON.stringify({ query: content, count: 5 }),
                    },
                  },
                ];
                convo.push({ role: 'assistant', content: null, tool_calls: toolCalls } as any);
              }
              firstTurn = false;
              if (!toolCalls || toolCalls.length === 0) {
                const text = typeof message?.content === 'string' ? message.content : '';
                const stripLeadingJsonObjects = (input: string): string => {
                  let s = input || '';
                  // Remove one or more leading JSON blobs, including fenced code blocks,
                  // typically echoed function-call args from the provider.
                  while (true) {
                    const trimmed = s.trimStart();
                    // Handle fenced code blocks first: ```{...}``` or ```json {...}```
                    if (trimmed.startsWith('```')) {
                      const fenceEnd = trimmed.indexOf('```', 3);
                      if (fenceEnd > 0) {
                        const fenced = trimmed.slice(3, fenceEnd).trim();
                        // Remove only if the fenced block looks like our tool-call JSON
                        if (/\{[\s\S]*\}/.test(fenced) && /"(query|name)"\s*:/.test(fenced)) {
                          s = trimmed.slice(fenceEnd + 3);
                          continue;
                        }
                      }
                      break;
                    }
                    if (trimmed.startsWith('{')) {
                      // Only strip if this looks like our tool-call JSON
                      if (!/"(query|name)"\s*:/.test(trimmed.slice(0, 200))) break;
                      let depth = 0;
                      let inString = false;
                      let escaped = false;
                      let end = -1;
                      for (let i = 0; i < trimmed.length; i++) {
                        const ch = trimmed[i];
                        if (escaped) {
                          escaped = false;
                          continue;
                        }
                        if (ch === '\\') {
                          escaped = true;
                          continue;
                        }
                        if (ch === '"') {
                          inString = !inString;
                          continue;
                        }
                        if (!inString) {
                          if (ch === '{') depth++;
                          else if (ch === '}') {
                            depth--;
                            if (depth === 0) {
                              end = i + 1;
                              break;
                            }
                          }
                        }
                      }
                      if (end === -1) break;
                      s = trimmed.slice(end);
                      continue;
                    }
                    break;
                  }
                  return s.trimStart();
                };
                finalContent = stripLeadingJsonObjects(text);
                break;
              }
              // Execute tool calls serially; concatenate results into one tool message per call
              for (const tc of toolCalls) {
                calls++;
                const name = tc?.function?.name as string;
                let args: any = {};
                try {
                  const rawArgs = (tc?.function as any)?.arguments;
                  if (typeof rawArgs === 'string') args = JSON.parse(rawArgs || '{}');
                  else if (rawArgs && typeof rawArgs === 'object') args = rawArgs;
                  else args = {};
                } catch {}
                if (name !== 'web_search') continue;
                let rawQuery = String(args?.query || '').trim();
                const count = Math.min(Math.max(parseInt(String(args?.count || '5'), 10) || 5, 1), 10);
                // Fall back to the user's latest message as the query if the model omitted it
                if (!rawQuery) rawQuery = content.trim().slice(0, 256);
                // Try to reuse prefetch results when the query matches the original content
                const prefetch = get().ui.braveByMessageId?.[assistantMsg.id];
                let results: { title?: string; url?: string; description?: string }[] | undefined;
                if (prefetch && prefetch.query === content && prefetch.status === 'done') {
                  results = (prefetch.results || []).slice(0, count);
                }
                if (!results) {
                  // Indicate loading while we fetch Brave results
                  set((s) => ({
                    ui: {
                      ...s.ui,
                      braveByMessageId: {
                        ...(s.ui.braveByMessageId || {}),
                        [assistantMsg.id]: { query: rawQuery, status: 'loading' },
                      },
                    },
                  }));
                  try {
                    const res = await fetch(`/api/brave?q=${encodeURIComponent(rawQuery)}&count=${count}`, {
                      method: 'GET',
                      headers: { Accept: 'application/json' },
                      cache: 'no-store',
                      signal: controller.signal,
                    } as any);
                    if (res.ok) {
                      const data: any = await res.json();
                      results = (data?.results || []) as any[];
                      // Update UI with results (including empty arrays for a clear "no results" state)
                      set((s) => ({
                        ui: {
                          ...s.ui,
                          braveByMessageId: {
                            ...(s.ui.braveByMessageId || {}),
                            [assistantMsg.id]: { query: rawQuery, status: 'done', results },
                          },
                        },
                      }));
                    } else {
                      results = [];
                      // Mark error state so the UI can surface a failure panel
                      set((s) => ({
                        ui: {
                          ...s.ui,
                          braveByMessageId: {
                            ...(s.ui.braveByMessageId || {}),
                            [assistantMsg.id]: {
                              query: rawQuery,
                              status: 'error',
                              results: [],
                              error: res.status === 400 ? 'Missing BRAVE_SEARCH_API_KEY' : 'Search failed',
                            },
                          },
                        },
                      }));
                    }
                  } catch {
                    results = [];
                    set((s) => ({
                      ui: {
                        ...s.ui,
                        braveByMessageId: {
                          ...(s.ui.braveByMessageId || {}),
                          [assistantMsg.id]: {
                            query: rawQuery,
                            status: 'error',
                            results: [],
                            error: 'Network error',
                          },
                        },
                      },
                    }));
                  }
                }
                const toolPayload = JSON.stringify({
                  query: rawQuery,
                  results: (results || []).slice(0, count),
                });
                convo.push({ role: 'tool', name: 'web_search', tool_call_id: tc.id, content: toolPayload });
              }
              rounds++;
              // After executing tools, continue the loop; model may produce final response or request more tools
            }

            if (finalContent != null) {
              // Write the final content (non-streaming path)
              set((s) => ({ ui: { ...s.ui, isStreaming: false } }));
              const tokensIn = finalUsage?.prompt_tokens ?? finalUsage?.input_tokens;
              const tokensOut = finalUsage?.completion_tokens ?? finalUsage?.output_tokens;
              const final = {
                ...assistantMsg,
                content: finalContent,
                reasoning: undefined,
                metrics: { ttftMs: undefined, completionMs: undefined, promptTokens: tokensIn, completionTokens: tokensOut, tokensPerSec: undefined },
                tokensIn,
                tokensOut,
              } as any;
              set((s) => {
                const list = s.messages[chatId] ?? [];
                const updated = list.map((m) => (m.id === assistantMsg.id ? final : m));
                return { messages: { ...s.messages, [chatId]: updated } };
              });
              await saveMessage(final);
              set((s) => ({ ...s, _controller: undefined }) as any);
              return;
            }
            // If we reach here with no final content, fall back to streaming generation below
            set((s) => ({ ...s, _controller: undefined }) as any);
          } catch (e: any) {
            if (e?.message === 'unauthorized')
              set((s) => ({ ui: { ...s.ui, isStreaming: false, notice: 'Invalid API key' } }));
            if (e?.message === 'rate_limited')
              set((s) => ({ ui: { ...s.ui, isStreaming: false, notice: 'Rate limited. Retry later.' } }));
            set((s) => ({ ...s, _controller: undefined }) as any);
            // Fall through to streaming fallback
          }
        }

        // Streaming fallback: standard completion without tool-use
        try {
          const controller = new AbortController();
          set((s) => ({ ...s, _controller: controller as any }) as any);
          const tStart = performance.now();
          let tFirst: number | undefined;
          // If we attempted tool-use but didn't produce a final response, and we already have
          // prefetched results, inject them as a last-resort augmentation to improve grounding.
          // Compose an augmented system message that may include fallback Brave results
          const streamingMessages = await (async () => {
            if (combinedSystemForThisTurn) {
              const rest = msgs.filter((m) => m.role !== 'system');
              let augmented = combinedSystemForThisTurn;
              if (attemptToolUse) {
                let fbResults: { title?: string; url?: string; description?: string }[] | undefined;
                const pre = get().ui.braveByMessageId?.[assistantMsg.id];
                if (pre && pre.status === 'done' && pre.query === content) {
                  fbResults = pre.results || [];
                }
                if (!fbResults || fbResults.length === 0) {
                  // Show loading while fetching fallback results
                  set((s) => ({
                    ui: {
                      ...s.ui,
                      braveByMessageId: {
                        ...(s.ui.braveByMessageId || {}),
                        [assistantMsg.id]: { query: content, status: 'loading' },
                      },
                    },
                  }));
                  try {
                    const res = await fetch(`/api/brave?q=${encodeURIComponent(content)}&count=5`, {
                      method: 'GET',
                      headers: { Accept: 'application/json' },
                      cache: 'no-store',
                      signal: controller.signal,
                    } as any);
                    if (res.ok) {
                      const data: any = await res.json();
                      fbResults = (data?.results || []) as any[];
                      // Update UI with fallback results (even if empty)
                      set((s) => ({
                        ui: {
                          ...s.ui,
                          braveByMessageId: {
                            ...(s.ui.braveByMessageId || {}),
                            [assistantMsg.id]: { query: content, status: 'done', results: fbResults },
                          },
                        },
                      }));
                    } else {
                      if (res.status === 400) {
                        set((s) => ({ ui: { ...s.ui, notice: 'Missing BRAVE_SEARCH_API_KEY' } }));
                      }
                      fbResults = [];
                      set((s) => ({
                        ui: {
                          ...s.ui,
                          braveByMessageId: {
                            ...(s.ui.braveByMessageId || {}),
                            [assistantMsg.id]: {
                              query: content,
                              status: 'error',
                              results: [],
                              error: res.status === 400 ? 'Missing BRAVE_SEARCH_API_KEY' : 'Search failed',
                            },
                          },
                        },
                      }));
                    }
                  } catch {
                    fbResults = [];
                    set((s) => ({
                      ui: {
                        ...s.ui,
                        braveByMessageId: {
                          ...(s.ui.braveByMessageId || {}),
                          [assistantMsg.id]: {
                            query: content,
                            status: 'error',
                            results: [],
                            error: 'Network error',
                          },
                        },
                      },
                    }));
                  }
                }
                if (fbResults && fbResults.length > 0) {
                  const lines = fbResults
                    .slice(0, 5)
                    .map((r, i) => `${i + 1}. ${(r.title || r.url || 'Result').toString()} — ${r.url || ''}${r.description ? ` — ${r.description}` : ''}`)
                    .join('\n');
                  const fallbackBlock = `\n\nWeb search results (fallback):\n${lines}\n\nInstructions: Use these results to answer the user. Cite sources inline as [n].`;
                  augmented = augmented + fallbackBlock;
                }
              }
              return [{ role: 'system', content: augmented } as const, ...rest];
            }
            return msgs;
          })();
          // Streaming with JSON prefix sanitizer for models that echo tool-call JSON
          let startedStreamingContent = attemptToolUse ? false : true;
          let leadingBuffer = '';
          const tryStripJsonPrefix = () => {
            // Try to remove leading JSON blobs or fenced JSON blocks from leadingBuffer
            while (true) {
              const trimmed = leadingBuffer.trimStart();
              // Fenced block
              if (trimmed.startsWith('```')) {
                const end = trimmed.indexOf('```', 3);
                if (end > 0) {
                  const fenced = trimmed.slice(3, end).trim();
                  if (/\{[\s\S]*\}/.test(fenced) && /"(query|name)"\s*:/.test(fenced)) {
                    leadingBuffer = trimmed.slice(end + 3);
                    continue;
                  }
                }
                break;
              }
              if (trimmed.startsWith('{')) {
                if (!/"(query|name)"\s*:/.test(trimmed.slice(0, 200))) break;
                let depth = 0;
                let inString = false;
                let escaped = false;
                let endIdx = -1;
                for (let i = 0; i < trimmed.length; i++) {
                  const ch = trimmed[i];
                  if (escaped) {
                    escaped = false;
                    continue;
                  }
                  if (ch === '\\') {
                    escaped = true;
                    continue;
                  }
                  if (ch === '"') {
                    inString = !inString;
                    continue;
                  }
                  if (!inString) {
                    if (ch === '{') depth++;
                    else if (ch === '}') {
                      depth--;
                      if (depth === 0) {
                        endIdx = i + 1;
                        break;
                      }
                    }
                  }
                }
                if (endIdx === -1) return false; // need more tokens
                leadingBuffer = trimmed.slice(endIdx);
                continue;
              }
              break;
            }
            return true;
          };
          await streamChatCompletion({
            apiKey: key,
            model: chat.settings.model,
            messages: streamingMessages,
            temperature: chat.settings.temperature,
            top_p: chat.settings.top_p,
            max_tokens: chat.settings.max_tokens,
            reasoning_effort: chat.settings.reasoning_effort,
            reasoning_tokens: chat.settings.reasoning_tokens,
            signal: controller.signal,
            callbacks: {
              onToken: (delta) => {
                if (tFirst == null) tFirst = performance.now();
                if (!startedStreamingContent) {
                  leadingBuffer += delta;
                  // Only attempt strip when we have some structure or the buffer is reasonably long
                  const hasStructure = leadingBuffer.trimStart().startsWith('{') || leadingBuffer.trimStart().startsWith('```');
                  if (hasStructure) {
                    const ok = tryStripJsonPrefix();
                    // If after stripping there is remaining content that doesn't look like JSON, start streaming it
                    const rest = leadingBuffer.trimStart();
                    if (ok && rest && !(rest.startsWith('{') || rest.startsWith('```'))) {
                      startedStreamingContent = true;
                      const toEmit = leadingBuffer;
                      leadingBuffer = '';
                      set((s) => {
                        const list = s.messages[chatId] ?? [];
                        const updated = list.map((m) =>
                          m.id === assistantMsg.id ? { ...m, content: m.content + toEmit } : m,
                        );
                        return { messages: { ...s.messages, [chatId]: updated } };
                      });
                    }
                  } else if (leadingBuffer.length > 512) {
                    // Give up sanitizing if no JSON-like structure appears
                    startedStreamingContent = true;
                    const toEmit = leadingBuffer;
                    leadingBuffer = '';
                    set((s) => {
                      const list = s.messages[chatId] ?? [];
                      const updated = list.map((m) =>
                        m.id === assistantMsg.id ? { ...m, content: m.content + toEmit } : m,
                      );
                      return { messages: { ...s.messages, [chatId]: updated } };
                    });
                  }
                } else {
                  set((s) => {
                    const list = s.messages[chatId] ?? [];
                    const updated = list.map((m) =>
                      m.id === assistantMsg.id ? { ...m, content: m.content + delta } : m,
                    );
                    return { messages: { ...s.messages, [chatId]: updated } };
                  });
                }
              },
              onReasoningToken: (delta) => {
                if (tFirst == null) tFirst = performance.now();
                set((s) => {
                  const list = s.messages[chatId] ?? [];
                  const updated = list.map((m) =>
                    m.id === assistantMsg.id ? { ...m, reasoning: (m.reasoning || '') + delta } : m,
                  );
                  return { messages: { ...s.messages, [chatId]: updated } };
                });
              },
              onDone: async (full, extras) => {
                set((s) => ({ ui: { ...s.ui, isStreaming: false } }));
                const current = get().messages[chatId]?.find((m) => m.id === assistantMsg.id);
                const tEnd = performance.now();
                const ttftMs = tFirst ? Math.max(0, Math.round(tFirst - tStart)) : undefined;
                const completionMs = Math.max(0, Math.round(tEnd - tStart));
                const promptTokens = extras?.usage?.prompt_tokens ?? extras?.usage?.input_tokens;
                const completionTokens =
                  extras?.usage?.completion_tokens ?? extras?.usage?.output_tokens;
                const tokensPerSec =
                  completionTokens && completionMs
                    ? +(completionTokens / (completionMs / 1000)).toFixed(2)
                    : undefined;
                const finalContentStream = (() => {
                  const base = full || '';
                  // Also sanitize the full string in case buffering missed anything
                  const stripLeading = (input: string) => {
                    let s = input || '';
                    while (true) {
                      const trimmed = s.trimStart();
                      if (trimmed.startsWith('```')) {
                        const end = trimmed.indexOf('```', 3);
                        if (end > 0) {
                          const fenced = trimmed.slice(3, end).trim();
                          if (/\{[\s\S]*\}/.test(fenced) && /"(query|name)"\s*:/.test(fenced)) {
                            s = trimmed.slice(end + 3);
                            continue;
                          }
                        }
                        break;
                      }
                      if (trimmed.startsWith('{')) {
                        if (!/"(query|name)"\s*:/.test(trimmed.slice(0, 200))) break;
                        let depth = 0;
                        let inString = false;
                        let escaped = false;
                        let endIdx = -1;
                        for (let i = 0; i < trimmed.length; i++) {
                          const ch = trimmed[i];
                          if (escaped) {
                            escaped = false;
                            continue;
                          }
                          if (ch === '\\') {
                            escaped = true;
                            continue;
                          }
                          if (ch === '"') {
                            inString = !inString;
                            continue;
                          }
                          if (!inString) {
                            if (ch === '{') depth++;
                            else if (ch === '}') {
                              depth--;
                              if (depth === 0) { endIdx = i + 1; break; }
                            }
                          }
                        }
                        if (endIdx === -1) break;
                        s = trimmed.slice(endIdx);
                        continue;
                      }
                      break;
                    }
                    return s.trimStart();
                  };
                  return stripLeading(base);
                })();
                const final = {
                  ...assistantMsg,
                  content: finalContentStream,
                  reasoning: current?.reasoning,
                  metrics: { ttftMs, completionMs, promptTokens, completionTokens, tokensPerSec },
                  tokensIn: promptTokens,
                  tokensOut: completionTokens,
                };
                set((s) => {
                  const list = s.messages[chatId] ?? [];
                  const updated = list.map((m) => (m.id === assistantMsg.id ? final : m));
                  return { messages: { ...s.messages, [chatId]: updated } };
                });
                await saveMessage(final);
                set((s) => ({ ...s, _controller: undefined }) as any);
              },
              onError: (err) => {
                set((s) => ({ ui: { ...s.ui, isStreaming: false, notice: err.message } }));
                set((s) => ({ ...s, _controller: undefined }) as any);
              },
            },
          });
        } catch (e: any) {
          if (e?.message === 'unauthorized')
            set((s) => ({ ui: { ...s.ui, isStreaming: false, notice: 'Invalid API key' } }));
          if (e?.message === 'rate_limited')
            set((s) => ({
              ui: { ...s.ui, isStreaming: false, notice: 'Rate limited. Retry later.' },
            }));
          set((s) => ({ ...s, _controller: undefined }) as any);
        }
      },

      stopStreaming: () => {
        const controller = (get() as any)._controller as AbortController | undefined;
        controller?.abort();
        set((s) => ({ ui: { ...s.ui, isStreaming: false } }));
        set((s) => ({ ...s, _controller: undefined }) as any);
      },

      regenerateAssistantMessage: async (messageId, opts) => {
        const key = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY as string | undefined;
        if (!key)
          return set((s) => ({
            ui: { ...s.ui, notice: 'Missing NEXT_PUBLIC_OPENROUTER_API_KEY in .env' },
          }));
        const chatId = get().selectedChatId!;
        const chat = get().chats.find((c) => c.id === chatId)!;
        const list = get().messages[chatId] ?? [];
        const idx = list.findIndex((m) => m.id === messageId);
        if (idx === -1) return;
        // Build payload using all messages prior to the assistant message being regenerated
        const payloadBefore = buildChatCompletionMessages({
          chat,
          priorMessages: list.slice(0, idx),
          models: get().models,
        });
        // Prepare a new assistant message to stream into, replacing the old one in-place
        const replacement: Message = {
          id: messageId,
          chatId,
          role: 'assistant',
          content: '',
          createdAt: list[idx].createdAt,
          model: opts?.modelId || chat.settings.model,
          reasoning: '',
        };
        set((s) => ({
          messages: {
            ...s.messages,
            [chatId]: list.map((m) => (m.id === messageId ? replacement : m)),
          },
          ui: { ...s.ui, isStreaming: true },
        }));
        const msgs = payloadBefore;
        try {
          const controller = new AbortController();
          set((s) => ({ ...s, _controller: controller as any }) as any);
          const tStart = performance.now();
          let tFirst: number | undefined;
          await streamChatCompletion({
            apiKey: key,
            model: replacement.model!,
            messages: msgs,
            temperature: chat.settings.temperature,
            top_p: chat.settings.top_p,
            max_tokens: chat.settings.max_tokens,
            reasoning_effort: chat.settings.reasoning_effort,
            reasoning_tokens: chat.settings.reasoning_tokens,
            signal: controller.signal,
            callbacks: {
              onToken: (delta) => {
                if (tFirst == null) tFirst = performance.now();
                set((s) => {
                  const list2 = s.messages[chatId] ?? [];
                  const updated = list2.map((m) =>
                    m.id === replacement.id ? { ...m, content: m.content + delta } : m,
                  );
                  return { messages: { ...s.messages, [chatId]: updated } };
                });
              },
              onReasoningToken: (delta) => {
                set((s) => {
                  const list2 = s.messages[chatId] ?? [];
                  const updated = list2.map((m) =>
                    m.id === replacement.id ? { ...m, reasoning: (m.reasoning || '') + delta } : m,
                  );
                  return { messages: { ...s.messages, [chatId]: updated } };
                });
              },
              onDone: async (full, extras) => {
                set((s) => ({ ui: { ...s.ui, isStreaming: false } }));
                const current = get().messages[chatId]?.find((m) => m.id === replacement.id);
                const tEnd = performance.now();
                const ttftMs = tFirst ? Math.max(0, Math.round(tFirst - tStart)) : undefined;
                const completionMs = Math.max(0, Math.round(tEnd - tStart));
                const promptTokens = extras?.usage?.prompt_tokens ?? extras?.usage?.input_tokens;
                const completionTokens =
                  extras?.usage?.completion_tokens ?? extras?.usage?.output_tokens;
                const tokensPerSec =
                  completionTokens && completionMs
                    ? +(completionTokens / (completionMs / 1000)).toFixed(2)
                    : undefined;
                const final = {
                  ...replacement,
                  content: full,
                  reasoning: current?.reasoning,
                  metrics: { ttftMs, completionMs, promptTokens, completionTokens, tokensPerSec },
                  tokensIn: promptTokens,
                  tokensOut: completionTokens,
                };
                set((s) => {
                  const list = s.messages[chatId] ?? [];
                  const updated = list.map((m) => (m.id === replacement.id ? final : m));
                  return { messages: { ...s.messages, [chatId]: updated } };
                });
                await saveMessage(final);
                set((s) => ({ ...s, _controller: undefined }) as any);
              },
              onError: (err) => {
                set((s) => ({ ui: { ...s.ui, isStreaming: false, notice: err.message } }));
                set((s) => ({ ...s, _controller: undefined }) as any);
              },
            },
          });
        } catch (e: any) {
          if (e?.message === 'unauthorized')
            set((s) => ({ ui: { ...s.ui, isStreaming: false, notice: 'Invalid API key' } }));
          if (e?.message === 'rate_limited')
            set((s) => ({
              ui: { ...s.ui, isStreaming: false, notice: 'Rate limited. Retry later.' },
            }));
          set((s) => ({ ...s, _controller: undefined }) as any);
        }
      },
    }),
    {
      name: 'dialogia-ui',
      partialize: (s) => ({
        selectedChatId: s.selectedChatId,
        favoriteModelIds: s.favoriteModelIds,
        hiddenModelIds: s.hiddenModelIds,
      }),
    },
  ),
);

// Construct the message payload for the LLM from prior conversation, with a simple token window
function buildChatCompletionMessages(params: {
  chat: Chat;
  priorMessages: Message[];
  models: ORModel[];
  newUserContent?: string;
}): { role: 'system' | 'user' | 'assistant'; content: string }[] {
  const { chat, priorMessages, models, newUserContent } = params;
  const modelInfo = models.find((m) => m.id === chat.settings.model);
  const contextLimit = modelInfo?.context_length ?? 8000;
  const reservedForCompletion =
    typeof chat.settings.max_tokens === 'number' ? chat.settings.max_tokens : 1024;
  const maxPromptTokens = Math.max(512, contextLimit - reservedForCompletion);

  // Convert prior messages into OpenAI-style messages, excluding empty placeholders
  const history: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of priorMessages) {
    if (m.role === 'system') continue; // prefer current chat.settings.system
    if (!m.content) continue;
    if (m.role === 'user' || m.role === 'assistant') {
      history.push({ role: m.role, content: m.content });
    }
  }
  if (typeof newUserContent === 'string') {
    history.push({ role: 'user', content: newUserContent });
  }

  // Keep most recent messages within the token budget
  const historyWithTokens = history.map((msg) => ({
    ...msg,
    tokens: estimateTokens(msg.content) ?? 1,
  }));
  let running = 0;
  const kept: { role: 'user' | 'assistant'; content: string }[] = [];
  for (let i = historyWithTokens.length - 1; i >= 0; i--) {
    const t = historyWithTokens[i].tokens as number;
    if (running + t > maxPromptTokens) break;
    kept.push({ role: historyWithTokens[i].role, content: historyWithTokens[i].content });
    running += t;
  }
  kept.reverse();

  const finalMsgs: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];
  if (chat.settings.system && chat.settings.system.trim()) {
    finalMsgs.push({ role: 'system', content: chat.settings.system });
  }
  finalMsgs.push(...kept);
  return finalMsgs;
}

// Naive token estimator (rough approx: 4 chars per token)
function estimateTokens(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const chars = text.length;
  return Math.max(1, Math.round(chars / 4));
}
