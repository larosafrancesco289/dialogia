"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";
import { db, saveChat, saveMessage, kvGet, kvSet } from "@/lib/db";
import type { Chat, ChatSettings, Message, ORModel } from "@/lib/types";
import { encryptString, decryptString } from "@/lib/crypto";
import { fetchModels, streamChatCompletion } from "@/lib/openrouter";

type StorageMode = "memory" | "encrypted";

type UIState = {
  showSettings: boolean;
  isStreaming: boolean;
  notice?: string;
  sidebarCollapsed?: boolean;
  nextModel?: string;
};

type StoreState = {
  chats: Chat[];
  messages: Record<string, Message[]>; // chatId -> messages
  selectedChatId?: string;

  models: ORModel[];
  favoriteModelIds: string[];

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

  sendUserMessage: (content: string) => Promise<void>;
  stopStreaming: () => void;
  regenerateAssistantMessage: (messageId: string, opts?: { modelId?: string }) => Promise<void>;
};

const defaultSettings: ChatSettings = {
  model: "openai/gpt-5-chat",
  // temperature/top_p/max_tokens omitted by default; OpenRouter will use model defaults
  system: "You are a helpful assistant.",
  reasoning_effort: "low",
  show_thinking_by_default: true,
  show_stats: true,
};

export const useChatStore = create<StoreState>()(
  persist(
    (set, get) => ({
      chats: [],
      messages: {},
      selectedChatId: undefined,
      models: [],
      favoriteModelIds: [],
      ui: { showSettings: false, isStreaming: false, sidebarCollapsed: false },
      _controller: undefined as AbortController | undefined,

      initializeApp: async () => {
        const compareMessages = (a: Message, b: Message) => {
          if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
          const rolePriority: Record<Message["role"], number> = { system: 0, user: 1, assistant: 2 };
          if (rolePriority[a.role] !== rolePriority[b.role]) return rolePriority[a.role] - rolePriority[b.role];
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
          title: "New Chat",
          createdAt: now,
          updatedAt: now,
          settings: { ...defaultSettings, model: get().ui.nextModel ?? defaultSettings.model },
        };
        await saveChat(chat);
        set((s) => ({ chats: [chat, ...s.chats], selectedChatId: id }));
      },
      selectChat: (id) => set({ selectedChatId: id }),
      renameChat: async (id, title) => {
        set((s) => ({
          chats: s.chats.map((c) => (c.id === id ? { ...c, title, updatedAt: Date.now() } : c)),
        }));
        const chat = (get().chats.find((c) => c.id === id))!;
        await saveChat(chat);
      },
      deleteChat: async (id) => {
        await db.transaction("rw", db.chats, db.messages, async () => {
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
            c.id === id ? { ...c, settings: { ...c.settings, ...partial }, updatedAt: Date.now() } : c
          ),
        }));
        const chat = get().chats.find((c) => c.id === id)!;
        await saveChat(chat);
      },
      setUI: (partial) => set((s) => ({ ui: { ...s.ui, ...partial } })),

      loadModels: async () => {
        const key = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY as string | undefined;
        if (!key) return set((s) => ({ ui: { ...s.ui, notice: "Missing NEXT_PUBLIC_OPENROUTER_API_KEY in .env" } }));
        try {
          const models = await fetchModels(key);
          set({ models });
        } catch (e: any) {
          if (e?.message === "unauthorized") set((s) => ({ ui: { ...s.ui, notice: "Invalid API key" } }));
        }
      },
      toggleFavoriteModel: (id) => set((s) => ({
        favoriteModelIds: s.favoriteModelIds.includes(id)
          ? s.favoriteModelIds.filter((m) => m !== id)
          : [id, ...s.favoriteModelIds],
      })),

      sendUserMessage: async (content: string) => {
        const key = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY as string | undefined;
        if (!key) return set((s) => ({ ui: { ...s.ui, notice: "Missing NEXT_PUBLIC_OPENROUTER_API_KEY in .env" } }));
        const chatId = get().selectedChatId!;
        const chat = get().chats.find((c) => c.id === chatId)!;
        const now = Date.now();
        const userMsg: Message = {
          id: uuidv4(),
          chatId,
          role: "user",
          content,
          createdAt: now,
        };
        const assistantMsg: Message = {
          id: uuidv4(),
          chatId,
          role: "assistant",
          content: "",
          // Ensure assistant message sorts after the user message even if timestamps are equal
          createdAt: now + 1,
          model: chat.settings.model,
          reasoning: "",
        };
         // Build the LLM payload using prior conversation and this new user message
         const priorList = get().messages[chatId] ?? [];
         const msgs = buildChatCompletionMessages({
           chat,
           priorMessages: priorList,
           models: get().models,
           newUserContent: content,
         });
        set((s) => ({
          messages: {
            ...s.messages,
            [chatId]: [...(s.messages[chatId] ?? []), userMsg, assistantMsg],
          },
          ui: { ...s.ui, isStreaming: true },
        }));
        await saveMessage(userMsg);
        await saveMessage(assistantMsg);
        // auto-name chat if default title
        if (chat.title === "New Chat") {
          const draft = content.trim().slice(0, 40);
          await get().renameChat(chat.id, draft || "New Chat");
        }

        try {
          const controller = new AbortController();
          set((s) => ({ ...s, _controller: controller as any } as any));
          const tStart = performance.now();
          let tFirst: number | undefined;
          await streamChatCompletion({
            apiKey: key,
            model: chat.settings.model,
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
                  const list = s.messages[chatId] ?? [];
                  const updated = list.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, content: m.content + delta }
                      : m
                  );
                  return { messages: { ...s.messages, [chatId]: updated } };
                });
              },
              onReasoningToken: (delta) => {
                if (tFirst == null) tFirst = performance.now();
                set((s) => {
                  const list = s.messages[chatId] ?? [];
                  const updated = list.map((m) =>
                    m.id === assistantMsg.id ? { ...m, reasoning: (m.reasoning || "") + delta } : m
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
                const completionTokens = extras?.usage?.completion_tokens ?? extras?.usage?.output_tokens;
                const tokensPerSec = completionTokens && completionMs
                  ? +(completionTokens / (completionMs / 1000)).toFixed(2)
                  : undefined;
                const final = {
                  ...assistantMsg,
                  content: full,
                  reasoning: current?.reasoning,
                  metrics: { ttftMs, completionMs, promptTokens, completionTokens, tokensPerSec },
                  tokensIn: promptTokens,
                  tokensOut: completionTokens,
                };
                // Update in-memory list immediately so stats show without reload
                set((s) => {
                  const list = s.messages[chatId] ?? [];
                  const updated = list.map((m) => (m.id === assistantMsg.id ? final : m));
                  return { messages: { ...s.messages, [chatId]: updated } };
                });
                await saveMessage(final);
                set((s) => ({ ...s, _controller: undefined } as any));
              },
              onError: (err) => {
                set((s) => ({ ui: { ...s.ui, isStreaming: false, notice: err.message } }));
                set((s) => ({ ...s, _controller: undefined } as any));
              },
            },
          });
        } catch (e: any) {
          if (e?.message === "unauthorized") set((s) => ({ ui: { ...s.ui, isStreaming: false, notice: "Invalid API key" } }));
          if (e?.message === "rate_limited") set((s) => ({ ui: { ...s.ui, isStreaming: false, notice: "Rate limited. Retry later." } }));
          set((s) => ({ ...s, _controller: undefined } as any));
        }
      },

      stopStreaming: () => {
        const controller = (get() as any)._controller as AbortController | undefined;
        controller?.abort();
        set((s) => ({ ui: { ...s.ui, isStreaming: false } }));
        set((s) => ({ ...s, _controller: undefined } as any));
      },

      regenerateAssistantMessage: async (messageId, opts) => {
        const key = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY as string | undefined;
        if (!key) return set((s) => ({ ui: { ...s.ui, notice: "Missing NEXT_PUBLIC_OPENROUTER_API_KEY in .env" } }));
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
          role: "assistant",
          content: "",
          createdAt: list[idx].createdAt,
          model: opts?.modelId || chat.settings.model,
          reasoning: "",
        };
        set((s) => ({
          messages: { ...s.messages, [chatId]: list.map((m) => (m.id === messageId ? replacement : m)) },
          ui: { ...s.ui, isStreaming: true },
        }));
         const msgs = payloadBefore;
        try {
          const controller = new AbortController();
          set((s) => ({ ...s, _controller: controller as any } as any));
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
                  const updated = list2.map((m) => (m.id === replacement.id ? { ...m, content: m.content + delta } : m));
                  return { messages: { ...s.messages, [chatId]: updated } };
                });
              },
              onReasoningToken: (delta) => {
                set((s) => {
                  const list2 = s.messages[chatId] ?? [];
                  const updated = list2.map((m) => (m.id === replacement.id ? { ...m, reasoning: (m.reasoning || "") + delta } : m));
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
                const completionTokens = extras?.usage?.completion_tokens ?? extras?.usage?.output_tokens;
                const tokensPerSec = completionTokens && completionMs
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
                set((s) => ({ ...s, _controller: undefined } as any));
              },
              onError: (err) => {
                set((s) => ({ ui: { ...s.ui, isStreaming: false, notice: err.message } }));
                set((s) => ({ ...s, _controller: undefined } as any));
              },
            },
          });
        } catch (e: any) {
          if (e?.message === "unauthorized") set((s) => ({ ui: { ...s.ui, isStreaming: false, notice: "Invalid API key" } }));
          if (e?.message === "rate_limited") set((s) => ({ ui: { ...s.ui, isStreaming: false, notice: "Rate limited. Retry later." } }));
          set((s) => ({ ...s, _controller: undefined } as any));
        }
      },
    }),
    {
      name: "dialogia-ui",
      partialize: (s) => ({
        selectedChatId: s.selectedChatId,
        favoriteModelIds: s.favoriteModelIds,
      }),
    }
  )
);

// Construct the message payload for the LLM from prior conversation, with a simple token window
function buildChatCompletionMessages(params: {
  chat: Chat;
  priorMessages: Message[];
  models: ORModel[];
  newUserContent?: string;
}): { role: "system" | "user" | "assistant"; content: string }[] {
  const { chat, priorMessages, models, newUserContent } = params;
  const modelInfo = models.find((m) => m.id === chat.settings.model);
  const contextLimit = modelInfo?.context_length ?? 8000;
  const reservedForCompletion =
    typeof chat.settings.max_tokens === "number" ? chat.settings.max_tokens : 1024;
  const maxPromptTokens = Math.max(512, contextLimit - reservedForCompletion);

  // Convert prior messages into OpenAI-style messages, excluding empty placeholders
  const history: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of priorMessages) {
    if (m.role === "system") continue; // prefer current chat.settings.system
    if (!m.content) continue;
    if (m.role === "user" || m.role === "assistant") {
      history.push({ role: m.role, content: m.content });
    }
  }
  if (typeof newUserContent === "string") {
    history.push({ role: "user", content: newUserContent });
  }

  // Keep most recent messages within the token budget
  const historyWithTokens = history.map((msg) => ({
    ...msg,
    tokens: estimateTokens(msg.content) ?? 1,
  }));
  let running = 0;
  const kept: { role: "user" | "assistant"; content: string }[] = [];
  for (let i = historyWithTokens.length - 1; i >= 0; i--) {
    const t = historyWithTokens[i].tokens as number;
    if (running + t > maxPromptTokens) break;
    kept.push({ role: historyWithTokens[i].role, content: historyWithTokens[i].content });
    running += t;
  }
  kept.reverse();

  const finalMsgs: { role: "system" | "user" | "assistant"; content: string }[] = [];
  if (chat.settings.system && chat.settings.system.trim()) {
    finalMsgs.push({ role: "system", content: chat.settings.system });
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


