import { v4 as uuidv4 } from 'uuid';
import { db, saveChat, saveFolder } from '@/lib/db';
import type { StoreState } from '@/lib/store/types';
import type { Chat, Folder, Message } from '@/lib/types';
import { DEFAULT_MODEL_ID } from '@/lib/constants';

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
          tutor_mode: get().ui.nextTutorMode ?? false,
        },
      };
      await saveChat(chat);
      set((s) => ({ chats: [chat, ...s.chats], selectedChatId: id }));
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

    async updateChatSettings(partial) {
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
