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
};

const defaultSettings: ChatSettings = {
  model: "openai/gpt-5-chat",
  // temperature/top_p/max_tokens omitted by default; OpenRouter will use model defaults
  system: "You are a helpful assistant.",
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

      initializeApp: async () => {
        const chats = await db.chats.toArray();
        const messagesArray = await db.messages.toArray();
        const messages: Record<string, Message[]> = {};
        for (const m of messagesArray) {
          if (!messages[m.chatId]) messages[m.chatId] = [];
          messages[m.chatId].push(m);
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
        const userMsg: Message = {
          id: uuidv4(),
          chatId,
          role: "user",
          content,
          createdAt: Date.now(),
        };
        const assistantMsg: Message = {
          id: uuidv4(),
          chatId,
          role: "assistant",
          content: "",
          createdAt: Date.now(),
          model: chat.settings.model,
        };
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

        const msgs = [
          chat.settings.system ? { role: "system" as const, content: chat.settings.system } : undefined,
          { role: "user" as const, content },
        ].filter(Boolean) as { role: "system" | "user"; content: string }[];

        try {
          await streamChatCompletion({
            apiKey: key,
            model: chat.settings.model,
            messages: msgs,
            temperature: chat.settings.temperature,
            top_p: chat.settings.top_p,
            max_tokens: chat.settings.max_tokens,
            callbacks: {
              onToken: (delta) => {
                set((s) => {
                  const list = s.messages[chatId] ?? [];
                  const updated = list.map((m) =>
                    m.id === assistantMsg.id ? { ...m, content: m.content + delta } : m
                  );
                  return { messages: { ...s.messages, [chatId]: updated } };
                });
              },
              onDone: async (full) => {
                set((s) => ({ ui: { ...s.ui, isStreaming: false } }));
                const final = { ...assistantMsg, content: full };
                await saveMessage(final);
              },
              onError: (err) => {
                set((s) => ({ ui: { ...s.ui, isStreaming: false, notice: err.message } }));
              },
            },
          });
        } catch (e: any) {
          if (e?.message === "unauthorized") set((s) => ({ ui: { ...s.ui, isStreaming: false, notice: "Invalid API key" } }));
          if (e?.message === "rate_limited") set((s) => ({ ui: { ...s.ui, isStreaming: false, notice: "Rate limited. Retry later." } }));
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


