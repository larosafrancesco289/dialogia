import { v4 as uuidv4 } from 'uuid';
import { db, saveChat, saveFolder, saveMessage } from '@/lib/db';
import type { StoreState } from '@/lib/store/types';
import type { Chat, Folder, Message } from '@/lib/types';
import {
  DEFAULT_MODEL_ID,
  DEFAULT_TUTOR_MODEL_ID,
  DEFAULT_TUTOR_MEMORY_MODEL_ID,
  DEFAULT_TUTOR_MEMORY_FREQUENCY,
} from '@/lib/constants';
import { buildHiddenTutorContent } from '@/lib/agent/tutorFlow';
import { EMPTY_TUTOR_MEMORY, normalizeTutorMemory } from '@/lib/agent/tutorMemory';
import { deriveChatSettingsFromUi } from '@/lib/store/chatSettings';

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
                  const hidden = buildHiddenTutorContent(tutor);
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
      // Prefer last used model from the currently selected chat when creating a new chat.
      const selected = get().selectedChatId
        ? get().chats.find((c) => c.id === get().selectedChatId)
        : undefined;
      const lastNonTutorModel = (() => {
        let candidate: { model: string; updatedAt: number } | undefined;
        for (const c of get().chats) {
          const model = c.settings?.model;
          if (!model || c.settings?.tutor_mode) continue;
          if (!candidate || (c.updatedAt ?? 0) > candidate.updatedAt) {
            candidate = { model, updatedAt: c.updatedAt ?? 0 };
          }
        }
        return candidate?.model;
      })();
      const lastUsedModel = !selected?.settings?.tutor_mode
        ? selected?.settings?.model
        : lastNonTutorModel;
      const braveEnabled = !!get().ui.experimentalBrave;
      const tutorEnabledGlobally = !!get().ui.experimentalTutor;
      const forceTutorMode = !!(get().ui.forceTutorMode ?? false);
      const uiState = get().ui;
      const baseSettings = deriveChatSettingsFromUi({
        ui: uiState,
        fallbackModelId: DEFAULT_MODEL_ID,
        fallbackSystem: 'You are a helpful assistant.',
        lastUsedModelId: lastUsedModel,
        braveEnabled,
        tutorEnabled: tutorEnabledGlobally,
        forceTutorMode,
      });
      const chat: Chat = {
        id,
        title: 'New Chat',
        createdAt: now,
        updatedAt: now,
        settings: baseSettings,
      };
      await saveChat(chat);
      set((s) => ({ chats: [chat, ...s.chats], selectedChatId: id }));
      if (baseSettings.tutor_mode) {
        try {
          (get().prepareTutorWelcomeMessage as any)(id);
        } catch {}
      }
      // Reset ephemeral "next" flags so they only apply to this new chat
      set((s) => ({
        ui: {
          ...s.ui,
          nextModel: undefined,
          nextSearchWithBrave: false,
          nextSearchProvider: undefined,
          // Ensure DeepResearch is not auto-enabled for new chats
          nextDeepResearch: false,
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
      const uiState = get().ui;
      const forceTutorMode = !!(uiState.forceTutorMode ?? false);
      let appliedPartial = { ...partial } as Partial<Chat['settings']>;
      const desiredModel =
        uiState.tutorDefaultModelId ||
        before?.settings.tutor_default_model ||
        DEFAULT_TUTOR_MODEL_ID;
      const desiredMemoryModel =
        uiState.tutorMemoryModelId ||
        before?.settings.tutor_memory_model ||
        DEFAULT_TUTOR_MEMORY_MODEL_ID;
      let nextGlobalMemory = normalizeTutorMemory(uiState.tutorGlobalMemory);
      const ensureTutorDefaults = () => {
        const partialMemoryDisabled =
          typeof appliedPartial.tutor_memory_disabled === 'boolean'
            ? appliedPartial.tutor_memory_disabled
            : undefined;
        const memoryDisabled =
          partialMemoryDisabled ??
          (typeof before?.settings.tutor_memory_disabled === 'boolean'
            ? before.settings.tutor_memory_disabled
            : uiState.tutorMemoryAutoUpdate === false);
        const baseMemory = appliedPartial.tutor_memory
          ? normalizeTutorMemory(appliedPartial.tutor_memory)
          : before?.settings.tutor_memory
            ? normalizeTutorMemory(before.settings.tutor_memory)
            : nextGlobalMemory;
        const normalizedMemory = normalizeTutorMemory(baseMemory);
        nextGlobalMemory = normalizedMemory;
        appliedPartial = {
          ...appliedPartial,
          tutor_mode: true,
          model: desiredModel,
          tutor_default_model: desiredModel,
          tutor_memory_model: desiredMemoryModel,
          tutor_memory: normalizedMemory,
          tutor_memory_version: before?.settings.tutor_memory_version ?? 0,
          tutor_memory_message_count: before?.settings.tutor_memory_message_count ?? 0,
          tutor_memory_frequency:
            before?.settings.tutor_memory_frequency ||
            uiState.tutorMemoryFrequency ||
            DEFAULT_TUTOR_MEMORY_FREQUENCY,
          tutor_memory_disabled: memoryDisabled,
        };
      };

      if (appliedPartial.tutor_mode === true) ensureTutorDefaults();
      if (forceTutorMode) ensureTutorDefaults();
      set((s) => ({
        chats: s.chats.map((c) => {
          if (c.id !== id) return c;
          const updatedSettings = { ...c.settings, ...appliedPartial };
          // If forceTutorMode is active, never allow tutor_mode to be false
          if (forceTutorMode) updatedSettings.tutor_mode = true;
          return { ...c, settings: updatedSettings, updatedAt: Date.now() };
        }),
        ui: { ...s.ui, tutorGlobalMemory: nextGlobalMemory },
      }));
      const chat = get().chats.find((c) => c.id === id)!;
      await saveChat(chat);
      try {
        const turnedOn =
          typeof appliedPartial?.tutor_mode === 'boolean' &&
          before &&
          before.settings.tutor_mode !== appliedPartial.tutor_mode &&
          appliedPartial.tutor_mode === true;
        if (turnedOn && !!get().ui.experimentalTutor) {
          (get().prepareTutorWelcomeMessage as any)(id);
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
