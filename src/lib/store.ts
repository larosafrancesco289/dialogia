'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { db, saveChat, saveMessage, saveFolder } from '@/lib/db';
import type { Chat, ChatSettings, Message, ORModel, MessageMetrics, Folder } from '@/lib/types';
// crypto helpers are available in `@/lib/crypto` if encrypted storage is added later
import { fetchModels, streamChatCompletion, chatCompletion } from '@/lib/openrouter';
import { buildChatCompletionMessages } from '@/lib/agent/conversation';
import { stripLeadingToolJson } from '@/lib/agent/streaming';
import { DEFAULT_MODEL_ID, PINNED_MODEL_ID, MAX_FALLBACK_RESULTS } from '@/lib/constants';

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
  // Ephemeral compare drawer state
  compare?: {
    isOpen: boolean;
    prompt: string;
    selectedModelIds: string[];
    runs: Record<
      string,
      {
        status: 'idle' | 'running' | 'done' | 'error' | 'aborted';
        content: string;
        reasoning?: string;
        metrics?: MessageMetrics;
        tokensIn?: number;
        tokensOut?: number;
        error?: string;
      }
    >;
  };
};

type StoreState = {
  chats: Chat[];
  folders: Folder[];
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
  moveChatToFolder: (chatId: string, folderId?: string) => Promise<void>;
  
  // Folder management
  createFolder: (name: string, parentId?: string) => Promise<void>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  toggleFolderExpanded: (id: string) => Promise<void>;
  setUI: (partial: Partial<UIState>) => void;
  // Compare drawer controls
  openCompare: () => void;
  closeCompare: () => void;
  setCompare: (partial: Partial<NonNullable<UIState['compare']>>) => void;
  runCompare: (prompt: string, modelIds: string[]) => Promise<void>;
  stopCompare: () => void;

  loadModels: (opts?: { showErrors?: boolean }) => Promise<void>;
  toggleFavoriteModel: (id: string) => void;
  hideModel: (id: string) => void;
  unhideModel: (id: string) => void;
  resetHiddenModels: () => void;
  removeModelFromDropdown: (id: string) => void;

  sendUserMessage: (content: string) => Promise<void>;
  stopStreaming: () => void;
  regenerateAssistantMessage: (messageId: string, opts?: { modelId?: string }) => Promise<void>;
  editUserMessage: (
    messageId: string,
    newContent: string,
    opts?: { rerun?: boolean },
  ) => Promise<void>;
  editAssistantMessage: (messageId: string, newContent: string) => Promise<void>;
};

const defaultSettings: ChatSettings = {
  model: DEFAULT_MODEL_ID,
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
      folders: [],
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
        compare: { isOpen: false, prompt: '', selectedModelIds: [], runs: {} },
      },
      _controller: undefined as AbortController | undefined,
      _compareControllers: {} as Record<string, AbortController>,

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
        const folders = await db.folders.toArray();
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
        set({ chats, folders, messages, selectedChatId });
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

      moveChatToFolder: async (chatId, folderId) => {
        set((s) => ({
          chats: s.chats.map((c) =>
            c.id === chatId ? { ...c, folderId, updatedAt: Date.now() } : c,
          ),
        }));
        const chat = get().chats.find((c) => c.id === chatId)!;
        await saveChat(chat);
      },

      createFolder: async (name, parentId) => {
        const id = uuidv4();
        const now = Date.now();
        const folder: Folder = {
          id,
          name,
          createdAt: now,
          updatedAt: now,
          isExpanded: true,
          parentId,
        };
        await saveFolder(folder);
        set((s) => ({ folders: [...s.folders, folder] }));
      },

      renameFolder: async (id, name) => {
        set((s) => ({
          folders: s.folders.map((f) => 
            f.id === id ? { ...f, name, updatedAt: Date.now() } : f
          ),
        }));
        const folder = get().folders.find((f) => f.id === id)!;
        await saveFolder(folder);
      },

      deleteFolder: async (id) => {
        // Move chats in this folder to the root level
        const chatsInFolder = get().chats.filter((c) => c.folderId === id);
        for (const chat of chatsInFolder) {
          await get().moveChatToFolder(chat.id, undefined);
        }
        
        // Move child folders to root level
        const childFolders = get().folders.filter((f) => f.parentId === id);
        for (const childFolder of childFolders) {
          set((s) => ({
            folders: s.folders.map((f) => 
              f.id === childFolder.id ? { ...f, parentId: undefined, updatedAt: Date.now() } : f
            ),
          }));
          const updatedFolder = get().folders.find((f) => f.id === childFolder.id)!;
          await saveFolder(updatedFolder);
        }

        // Delete the folder
        await db.folders.delete(id);
        set((s) => ({ folders: s.folders.filter((f) => f.id !== id) }));
      },

      toggleFolderExpanded: async (id) => {
        set((s) => ({
          folders: s.folders.map((f) => 
            f.id === id ? { ...f, isExpanded: !f.isExpanded, updatedAt: Date.now() } : f
          ),
        }));
        const folder = get().folders.find((f) => f.id === id)!;
        await saveFolder(folder);
      },
      setUI: (partial) => set((s) => ({ ui: { ...s.ui, ...partial } })),

      // Compare drawer: basic open/close and state updates
      openCompare: () => {
        set((s) => {
          const chatId = get().selectedChatId;
          const chat = chatId ? get().chats.find((c) => c.id === chatId) : undefined;
          const fallback = s.ui.nextModel || DEFAULT_MODEL_ID;
          const currentModel = chat?.settings.model || fallback;
          const existing = s.ui.compare?.selectedModelIds || [];
          const initial = existing.length > 0 ? existing : [currentModel].filter(Boolean);
          return {
            ui: {
              ...s.ui,
              compare: {
                isOpen: true,
                prompt: s.ui.compare?.prompt || '',
                selectedModelIds: initial,
                runs: {},
              },
            },
          };
        });
        // Opportunistically refresh models each time the drawer opens
        get()
          .loadModels()
          .catch(() => void 0);
      },
      closeCompare: () =>
        set((s) => ({
          ui: {
            ...s.ui,
            compare: {
              ...(s.ui.compare || ({} as any)),
              isOpen: false,
              runs: s.ui.compare?.runs || {},
            },
          },
        })),
      setCompare: (partial) =>
        set((s) => {
          const prev = s.ui.compare || {
            isOpen: false,
            prompt: '',
            selectedModelIds: [],
            runs: {},
          };
          const willChangeSelection = Object.prototype.hasOwnProperty.call(
            partial,
            'selectedModelIds',
          );
          return {
            ui: {
              ...s.ui,
              compare: {
                ...prev,
                ...partial,
                runs: willChangeSelection ? {} : prev.runs,
              },
            },
          };
        }),

      runCompare: async (prompt, modelIds) => {
        const key = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY as string | undefined;
        if (!key)
          return set((s) => ({
            ui: { ...s.ui, notice: 'Missing NEXT_PUBLIC_OPENROUTER_API_KEY in .env' },
          }));
        const chatId = get().selectedChatId;
        const chat = chatId ? get().chats.find((c) => c.id === chatId)! : undefined;
        const prior = chatId ? (get().messages[chatId] ?? []) : [];

        // Reset runs
        set((s) => ({
          ui: {
            ...s.ui,
            compare: {
              ...(s.ui.compare || { isOpen: true, prompt, selectedModelIds: modelIds, runs: {} }),
              isOpen: true,
              prompt,
              selectedModelIds: modelIds,
              runs: Object.fromEntries(
                modelIds.map((id) => [id, { status: 'running', content: '' as string }]),
              ),
            },
          },
        }));

        // Abort any previous compare run
        const prev = (get() as any)._compareControllers as Record<string, AbortController>;
        Object.values(prev || {}).forEach((c) => c.abort());
        set((s) => ({ ...(s as any), _compareControllers: {} as any }) as any);

        // Launch parallel streams
        const controllers: Record<string, AbortController> = {};
        await Promise.all(
          modelIds.map(async (modelId) => {
            const controller = new AbortController();
            controllers[modelId] = controller;
            const tStart = performance.now();
            let tFirst: number | undefined;
            try {
              // Build payload per model to respect different context windows
              const msgs = buildChatCompletionMessages({
                chat: chat
                  ? { ...chat, settings: { ...chat.settings, model: modelId } }
                  : {
                      id: 'tmp',
                      title: 'Compare',
                      createdAt: Date.now(),
                      updatedAt: Date.now(),
                      settings: {
                        model: modelId,
                        system: 'You are a helpful assistant.',
                        show_thinking_by_default: true,
                        show_stats: true,
                        search_with_brave: false,
                        reasoning_effort: undefined,
                      },
                    },
                priorMessages: prior,
                models: get().models,
                newUserContent: prompt,
              });
              await streamChatCompletion({
                apiKey: key,
                model: modelId,
                messages: msgs,
                temperature: chat?.settings.temperature,
                top_p: chat?.settings.top_p,
                max_tokens: chat?.settings.max_tokens,
                reasoning_effort: chat?.settings.reasoning_effort,
                reasoning_tokens: chat?.settings.reasoning_tokens,
                signal: controller.signal,
                callbacks: {
                  onToken: (delta) => {
                    if (tFirst == null) tFirst = performance.now();
                    set((s) => ({
                      ui: {
                        ...s.ui,
                        compare: {
                          ...(s.ui.compare || {
                            isOpen: true,
                            prompt,
                            selectedModelIds: modelIds,
                            runs: {},
                          }),
                          isOpen: true,
                          prompt: s.ui.compare?.prompt ?? prompt,
                          selectedModelIds: modelIds,
                          runs: {
                            ...(s.ui.compare?.runs || {}),
                            [modelId]: {
                              ...((s.ui.compare?.runs || {})[modelId] || {
                                status: 'running',
                                content: '',
                              }),
                              status: 'running',
                              content: `${(s.ui.compare?.runs || {})[modelId]?.content || ''}${delta}`,
                            },
                          },
                        },
                      },
                    }));
                  },
                  onReasoningToken: (delta) => {
                    set((s) => ({
                      ui: {
                        ...s.ui,
                        compare: {
                          ...(s.ui.compare || {
                            isOpen: true,
                            prompt,
                            selectedModelIds: modelIds,
                            runs: {},
                          }),
                          runs: {
                            ...(s.ui.compare?.runs || {}),
                            [modelId]: {
                              ...((s.ui.compare?.runs || {})[modelId] || {
                                status: 'running',
                                content: '',
                              }),
                              reasoning: `${(s.ui.compare?.runs || {})[modelId]?.reasoning || ''}${delta}`,
                            },
                          },
                        },
                      },
                    }));
                  },
                  onDone: (full, extras) => {
                    const tEnd = performance.now();
                    const ttftMs = tFirst ? Math.max(0, Math.round(tFirst - tStart)) : undefined;
                    const completionMs = Math.max(0, Math.round(tEnd - tStart));
                    const promptTokens =
                      extras?.usage?.prompt_tokens ?? extras?.usage?.input_tokens;
                    const completionTokens =
                      extras?.usage?.completion_tokens ?? extras?.usage?.output_tokens;
                    const tokensPerSec =
                      completionTokens && completionMs
                        ? +(completionTokens / (completionMs / 1000)).toFixed(2)
                        : undefined;
                    set((s) => ({
                      ui: {
                        ...s.ui,
                        compare: {
                          ...(s.ui.compare || {
                            isOpen: true,
                            prompt,
                            selectedModelIds: modelIds,
                            runs: {},
                          }),
                          runs: {
                            ...(s.ui.compare?.runs || {}),
                            [modelId]: {
                              ...((s.ui.compare?.runs || {})[modelId] || {
                                status: 'running',
                                content: '',
                              }),
                              status: 'done',
                              content: full,
                              metrics: {
                                ttftMs,
                                completionMs,
                                promptTokens,
                                completionTokens,
                                tokensPerSec,
                              },
                              tokensIn: promptTokens,
                              tokensOut: completionTokens,
                            },
                          },
                        },
                      },
                    }));
                  },
                  onError: (err) => {
                    set((s) => ({
                      ui: {
                        ...s.ui,
                        compare: {
                          ...(s.ui.compare || {
                            isOpen: true,
                            prompt,
                            selectedModelIds: modelIds,
                            runs: {},
                          }),
                          runs: {
                            ...(s.ui.compare?.runs || {}),
                            [modelId]: {
                              ...((s.ui.compare?.runs || {})[modelId] || {
                                status: 'running',
                                content: '',
                              }),
                              status: 'error',
                              error: err?.message || 'Error',
                            },
                          },
                        },
                      },
                    }));
                  },
                },
              });
            } catch (e: any) {
              if (e?.name === 'AbortError') {
                set((s) => ({
                  ui: {
                    ...s.ui,
                    compare: {
                      ...(s.ui.compare || {
                        isOpen: true,
                        prompt,
                        selectedModelIds: modelIds,
                        runs: {},
                      }),
                      runs: {
                        ...(s.ui.compare?.runs || {}),
                        [modelId]: {
                          ...((s.ui.compare?.runs || {})[modelId] || {
                            status: 'running',
                            content: '',
                          }),
                          status: 'aborted',
                        },
                      },
                    },
                  },
                }));
              } else if (e?.message === 'unauthorized') {
                set((s) => ({ ui: { ...s.ui, notice: 'Invalid API key' } }));
              } else if (e?.message === 'rate_limited') {
                set((s) => ({ ui: { ...s.ui, notice: 'Rate limited. Retry later.' } }));
              } else {
                set((s) => ({ ui: { ...s.ui, notice: e?.message || 'Compare failed' } }));
              }
            }
          }),
        );
        set((s) => ({ ...(s as any), _compareControllers: controllers as any }) as any);
      },

      stopCompare: () => {
        const map = (get() as any)._compareControllers as Record<string, AbortController>;
        Object.values(map || {}).forEach((c) => c.abort());
        set((s) => ({ ...(s as any), _compareControllers: {} as any }) as any);
      },

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
          ? chat.settings.system && chat.settings.system.trim()
            ? `${toolPreambleText}\n\n${chat.settings.system}`
            : toolPreambleText
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
            const planningMessages: any[] = [
              planningSystem,
              ...msgs.filter((m) => m.role !== 'system'),
            ];
            let convo = planningMessages.slice();
            let calls = 0; // executed tool calls
            let rounds = 0; // assistant response rounds
            let firstTurn = true;
            let finalContent: string | null = null;
            let finalUsage: any | undefined = undefined;

            const extractInlineWebSearchArgs = (
              text: string,
            ): { query: string; count?: number } | null => {
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
                      const cnt = Number.isFinite(c.count)
                        ? Math.max(1, Math.min(10, Math.floor(c.count)))
                        : undefined;
                      return { query: q, count: cnt };
                    }
                  }
                  if (typeof c.name === 'string' && c.name === 'web_search') {
                    const arg = c.arguments;
                    if (typeof arg === 'string') {
                      try {
                        const inner = JSON.parse(arg);
                        if (inner && typeof inner.query === 'string' && inner.query.trim()) {
                          const cnt = Number.isFinite(inner.count)
                            ? Math.max(1, Math.min(10, Math.floor(inner.count)))
                            : undefined;
                          return { query: inner.query.trim(), count: cnt };
                        }
                      } catch {}
                    } else if (arg && typeof arg === 'object' && typeof arg.query === 'string') {
                      const q = String(arg.query).trim();
                      if (q) {
                        const cnt = Number.isFinite(arg.count)
                          ? Math.max(1, Math.min(10, Math.floor(arg.count)))
                          : undefined;
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
                tool_choice: firstTurn
                  ? ({ type: 'function', function: { name: 'web_search' } } as any)
                  : 'auto',
                signal: controller.signal,
              });
              finalUsage = resp?.usage;
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
                finalContent = stripLeadingToolJson(text);
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
                const count = Math.min(
                  Math.max(parseInt(String(args?.count || '5'), 10) || 5, 1),
                  10,
                );
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
                    const res = await fetch(
                      `/api/brave?q=${encodeURIComponent(rawQuery)}&count=${count}`,
                      {
                        method: 'GET',
                        headers: { Accept: 'application/json' },
                        cache: 'no-store',
                        signal: controller.signal,
                      } as any,
                    );
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
                              error:
                                res.status === 400
                                  ? 'Missing BRAVE_SEARCH_API_KEY'
                                  : 'Search failed',
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
                convo.push({
                  role: 'tool',
                  name: 'web_search',
                  tool_call_id: tc.id,
                  content: toolPayload,
                });
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
                metrics: {
                  ttftMs: undefined,
                  completionMs: undefined,
                  promptTokens: tokensIn,
                  completionTokens: tokensOut,
                  tokensPerSec: undefined,
                },
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
              set((s) => ({
                ui: { ...s.ui, isStreaming: false, notice: 'Rate limited. Retry later.' },
              }));
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
                            [assistantMsg.id]: {
                              query: content,
                              status: 'done',
                              results: fbResults,
                            },
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
                              error:
                                res.status === 400
                                  ? 'Missing BRAVE_SEARCH_API_KEY'
                                  : 'Search failed',
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
                    .slice(0, MAX_FALLBACK_RESULTS)
                    .map(
                      (r, i) =>
                        `${i + 1}. ${(r.title || r.url || 'Result').toString()} — ${r.url || ''}${r.description ? ` — ${r.description}` : ''}`,
                    )
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
                  const hasStructure =
                    leadingBuffer.trimStart().startsWith('{') ||
                    leadingBuffer.trimStart().startsWith('```');
                  if (hasStructure) {
                    const stripped = stripLeadingToolJson(leadingBuffer);
                    const rest = stripped.trimStart();
                    if (rest && !(rest.startsWith('{') || rest.startsWith('```'))) {
                      startedStreamingContent = true;
                      const toEmit = stripped;
                      leadingBuffer = '';
                      set((s) => {
                        const list = s.messages[chatId] ?? [];
                        const updated = list.map((m) =>
                          m.id === assistantMsg.id ? { ...m, content: m.content + toEmit } : m,
                        );
                        return { messages: { ...s.messages, [chatId]: updated } };
                      });
                    } else {
                      // Keep buffering until we have enough to strip fully
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
                const finalContentStream = stripLeadingToolJson(full || '');
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

      editUserMessage: async (messageId, newContent, opts) => {
        const chatId = get().selectedChatId!;
        const list = get().messages[chatId] ?? [];
        const idx = list.findIndex((m) => m.id === messageId);
        if (idx === -1) return;
        const target = list[idx];
        if (target.role !== 'user') return;
        const updated = { ...target, content: newContent };
        // Update in-memory state
        set((s) => ({
          messages: {
            ...s.messages,
            [chatId]: (s.messages[chatId] ?? []).map((m) => (m.id === messageId ? updated : m)),
          },
        }));
        // Persist to IndexedDB
        await saveMessage(updated);
        // Optionally re-run the immediate following assistant message
        if (opts?.rerun) {
          // If currently streaming, stop first
          if (get().ui.isStreaming) {
            get().stopStreaming();
          }
          const nextAssistant = (get().messages[chatId] ?? [])
            .slice(idx + 1)
            .find((m) => m.role === 'assistant');
          if (nextAssistant) {
            // Fire-and-forget to avoid blocking the caller/UI edit state
            get()
              .regenerateAssistantMessage(nextAssistant.id)
              .catch(() => void 0);
          }
        }
      },

      // Directly edit the content of an assistant message in-place
      editAssistantMessage: async (messageId, newContent) => {
        const chatId = get().selectedChatId!;
        const list = get().messages[chatId] ?? [];
        const idx = list.findIndex((m) => m.id === messageId);
        if (idx === -1) return;
        const target = list[idx];
        if (target.role !== 'assistant') return;
        const updated = { ...target, content: newContent } as Message;
        set((s) => ({
          messages: {
            ...s.messages,
            [chatId]: (s.messages[chatId] ?? []).map((m) => (m.id === messageId ? updated : m)),
          },
        }));
        await saveMessage(updated);
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

// buildChatCompletionMessages moved to '@/lib/agent/conversation'
