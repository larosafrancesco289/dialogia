import { v4 as uuidv4 } from 'uuid';
import { db, saveChat, saveFolder, saveMessage } from '@/lib/db';
import type { StoreState } from '@/lib/store/types';
import type { Chat, Folder, Message } from '@/lib/types';
import { DEFAULT_MODEL_ID } from '@/lib/constants';
import {
  getTutorGreeting,
  buildTutorContextSummary,
  buildTutorContextFull,
} from '@/lib/agent/tutor';

export function createChatSlice(
  set: (updater: (s: StoreState) => Partial<StoreState> | void) => void,
  get: () => StoreState,
) {
  return {
    async initializeApp() {
      const compareMessages = (a: Message, b: Message) => {
        if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
        const rolePriority: Record<Message['role'], number> = { system: 0, user: 1, assistant: 2 };
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
      for (const key of Object.keys(messages)) {
        messages[key] = messages[key].slice().sort(compareMessages);
      }
      let selectedChatId = get().selectedChatId;
      if (chats.length && !selectedChatId) {
        selectedChatId = chats[0].id;
      }
      set({ chats, folders, messages, selectedChatId } as any);
      // Rehydrate tutor panels from persisted message payloads
      try {
        const tutorMap: Record<string, any> = {};
        const updates: { chatId: string; msg: any }[] = [];
        for (const [cid, list] of Object.entries(messages)) {
          for (const m of list) {
            if (m.role === 'assistant' && (m as any)?.tutor) {
              const tutor = (m as any).tutor;
              tutorMap[m.id] = tutor;
              // Backfill hiddenContent if missing so the model sees data without UI showing it
              if (!(m as any).hiddenContent) {
                try {
                  const recap = buildTutorContextSummary(tutor);
                  const json = buildTutorContextFull(tutor);
                  const parts: string[] = [];
                  if (recap) parts.push(`Tutor Recap:\n${recap}`);
                  if (json) parts.push(`Tutor Data JSON:\n${json}`);
                  const hidden = parts.join('\n\n');
                  if (hidden) {
                    (m as any).hiddenContent = hidden;
                    updates.push({ chatId: cid, msg: m });
                  }
                } catch {}
              }
            }
          }
        }
        if (Object.keys(tutorMap).length > 0)
          set((s) => ({
            ui: { ...s.ui, tutorByMessageId: { ...(s.ui.tutorByMessageId || {}), ...tutorMap } },
          }));
        // Persist any hiddenContent backfills
        for (const u of updates) {
          try {
            await (await import('@/lib/db')).saveMessage(u.msg);
          } catch {}
        }
      } catch {}
      // Preload tutor profile for the selected chat into UI (if available)
      try {
        if (selectedChatId) await (get().loadTutorProfileIntoUI as any)(selectedChatId);
      } catch {}
    },

    async newChat() {
      const id = uuidv4();
      const now = Date.now();
      const chat: Chat = {
        id,
        title: 'New Chat',
        createdAt: now,
        updatedAt: now,
        settings: {
          model: get().ui.nextModel ?? DEFAULT_MODEL_ID,
          system: get().ui.nextSystem ?? 'You are a helpful assistant.',
          temperature: get().ui.nextTemperature ?? undefined,
          top_p: get().ui.nextTopP ?? undefined,
          max_tokens: get().ui.nextMaxTokens ?? undefined,
          reasoning_effort: get().ui.nextReasoningEffort ?? undefined,
          reasoning_tokens: get().ui.nextReasoningTokens ?? undefined,
          show_thinking_by_default: get().ui.nextShowThinking ?? true,
          show_stats: get().ui.nextShowStats ?? true,
          search_with_brave: get().ui.nextSearchWithBrave ?? false,
          search_provider: get().ui.nextSearchProvider ?? 'brave',
          tutor_mode: get().ui.nextTutorMode ?? false,
        },
      };
      await saveChat(chat);
      set((s) => ({ chats: [chat, ...s.chats], selectedChatId: id }));
      // Reset ephemeral "next" flags so they only apply to this new chat
      set((s) => ({
        ui: {
          ...s.ui,
          nextModel: undefined,
          nextSearchWithBrave: false,
          nextSearchProvider: undefined,
          nextTutorMode: false,
          nextTutorNudge: undefined,
          nextReasoningEffort: undefined,
          nextReasoningTokens: undefined,
          nextSystem: undefined,
          nextTemperature: undefined,
          nextTopP: undefined,
          nextMaxTokens: undefined,
          nextShowThinking: undefined,
          nextShowStats: undefined,
        },
      }));
      // If starting a chat with tutor mode on, send a friendly greeting once.
      if (chat.settings.tutor_mode) {
        try {
          const greeted = get().ui.tutorGreetedByChatId?.[id];
          if (!greeted) {
            const greeting = getTutorGreeting();
            await (get().appendAssistantMessage as any)(greeting);
            set((s) => ({
              ui: {
                ...s.ui,
                tutorGreetedByChatId: { ...(s.ui.tutorGreetedByChatId || {}), [id]: true },
              },
            }));
          }
        } catch {}
      }
    },

    selectChat(id: string) {
      set({ selectedChatId: id } as any);
    },

    async renameChat(id: string, title: string) {
      set((s) => ({
        chats: s.chats.map((c) => (c.id === id ? { ...c, title, updatedAt: Date.now() } : c)),
      }));
      const chat = get().chats.find((c) => c.id === id)!;
      await saveChat(chat);
    },

    async deleteChat(id: string) {
      await db.transaction('rw', db.chats, db.messages, async () => {
        await db.chats.delete(id);
        await db.messages.where({ chatId: id }).delete();
      });
      set((s) => {
        const chats = s.chats.filter((c) => c.id !== id);
        const selectedChatId = s.selectedChatId === id ? chats[0]?.id : s.selectedChatId;
        const { [id]: _, ...rest } = s.messages;
        return { chats, messages: rest, selectedChatId } as any;
      });
    },

    async branchChatFromMessage(messageId: string) {
      // Find the source chat and message index
      const st = get();
      let sourceChatId: string | undefined;
      let msgIndex = -1;
      for (const [cid, list] of Object.entries(st.messages)) {
        const idx = list.findIndex((m) => m.id === messageId);
        if (idx >= 0) {
          sourceChatId = cid;
          msgIndex = idx;
          break;
        }
      }
      if (!sourceChatId || msgIndex < 0) return;
      const sourceChat = st.chats.find((c) => c.id === sourceChatId);
      if (!sourceChat) return;
      const sourceMessages = st.messages[sourceChatId] || [];
      const slice = sourceMessages.slice(0, msgIndex + 1);
      const now = Date.now();
      const newChatId = uuidv4();
      const newChat: import('@/lib/types').Chat = {
        id: newChatId,
        title: `${sourceChat.title || 'Chat'} (branch)`,
        createdAt: now,
        updatedAt: now,
        settings: { ...sourceChat.settings },
        folderId: sourceChat.folderId,
      };

      // Clone messages into the new chat with fresh IDs
      const cloned = slice.map((m) => ({
        ...m,
        id: uuidv4(),
        chatId: newChatId,
      }));

      await db.transaction('rw', db.chats, db.messages, async () => {
        await saveChat(newChat);
        for (const cm of cloned) await saveMessage(cm as any);
      });

      // Update in-memory state and focus the new branch
      set((s) => ({
        chats: [newChat, ...s.chats],
        messages: { ...s.messages, [newChatId]: cloned as any },
        selectedChatId: newChatId,
      }));
    },

    async updateChatSettings(partial) {
      const id = get().selectedChatId;
      if (!id) return;
      const before = get().chats.find((c) => c.id === id);
      set((s) => ({
        chats: s.chats.map((c) =>
          c.id === id
            ? { ...c, settings: { ...c.settings, ...partial }, updatedAt: Date.now() }
            : c,
        ),
      }));
      const chat = get().chats.find((c) => c.id === id)!;
      await saveChat(chat);
      // If tutor_mode has just been enabled for this chat, send a one‑time friendly greeting
      try {
        const turnedOn =
          typeof partial?.tutor_mode === 'boolean' &&
          before &&
          before.settings.tutor_mode !== partial.tutor_mode &&
          partial.tutor_mode === true;
        if (turnedOn) {
          const greeted = get().ui.tutorGreetedByChatId?.[id];
          if (!greeted) {
            const greeting = getTutorGreeting();
            await (get().appendAssistantMessage as any)(greeting);
            set((s) => ({
              ui: {
                ...s.ui,
                tutorGreetedByChatId: { ...(s.ui.tutorGreetedByChatId || {}), [id]: true },
              },
            }));
          }
        }
      } catch {}
    },

    async moveChatToFolder(chatId: string, folderId?: string) {
      set((s) => ({
        chats: s.chats.map((c) =>
          c.id === chatId ? { ...c, folderId, updatedAt: Date.now() } : c,
        ),
      }));
      const chat = get().chats.find((c) => c.id === chatId)!;
      await saveChat(chat);
    },

    async createFolder(name: string, parentId?: string) {
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

    async renameFolder(id: string, name: string) {
      set((s) => ({
        folders: s.folders.map((f) => (f.id === id ? { ...f, name, updatedAt: Date.now() } : f)),
      }));
      const folder = get().folders.find((f) => f.id === id)!;
      await saveFolder(folder);
    },

    async deleteFolder(id: string) {
      const chatsInFolder = get().chats.filter((c) => c.folderId === id);
      for (const chat of chatsInFolder) await get().moveChatToFolder(chat.id, undefined);

      const childFolders = get().folders.filter((f) => f.parentId === id);
      for (const childFolder of childFolders) {
        set((s) => ({
          folders: s.folders.map((f) =>
            f.id === childFolder.id ? { ...f, parentId: undefined, updatedAt: Date.now() } : f,
          ),
        }));
        const updatedFolder = get().folders.find((f) => f.id === childFolder.id)!;
        await saveFolder(updatedFolder);
      }

      await db.folders.delete(id);
      set((s) => ({ folders: s.folders.filter((f) => f.id !== id) }));
    },

    async toggleFolderExpanded(id: string) {
      set((s) => ({
        folders: s.folders.map((f) =>
          f.id === id ? { ...f, isExpanded: !f.isExpanded, updatedAt: Date.now() } : f,
        ),
      }));
      const folder = get().folders.find((f) => f.id === id)!;
      await saveFolder(folder);
    },
  } satisfies Partial<StoreState>;
}
