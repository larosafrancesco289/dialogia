import { v4 as uuidv4 } from 'uuid';
import { db, saveChat, saveFolder, saveMessage } from '@/lib/db';
import type { StoreState } from '@/lib/store/types';
import type { Chat, Folder } from '@/lib/types';
import type { StoreSetter } from '@/lib/agent/types';
import { DEFAULT_MODEL_ID, DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';
import { deriveChatSettingsFromUi } from '@/lib/store/chatSettings';
import { primeTutorWelcome } from '@/lib/services/turns';
import { applyTutorDefaults, normalizeParallelModels } from '@/lib/store/normalize';
import { resetEphemeralUi } from '@/lib/ui/defaults';
import { loadRepositorySnapshot } from '@/lib/db/repository';
import { mergeTutorMap } from '@/lib/ui/tutorSelectors';

export function createChatSlice(
  set: StoreSetter,
  get: () => StoreState,
  _store?: unknown,
) {
  return {
    async initializeApp() {
      const snapshot = await loadRepositorySnapshot(get().selectedChatId);
      set((s) => ({
        chats: snapshot.chats,
        folders: snapshot.folders,
        messages: snapshot.messages,
        selectedChatId: snapshot.selectedChatId,
        ui: mergeTutorMap(s.ui, snapshot.tutorByMessageId),
      }) as any);
      try {
        if (snapshot.selectedChatId) {
          await (get().loadTutorProfileIntoUI as any)(snapshot.selectedChatId);
        }
      } catch {
        /* ignore tutor profile preload errors */
      }
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
      const tutorEnabledGlobally = !!get().ui.experimentalTutor;
      const braveEnabled = !!get().ui.experimentalBrave;
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
      set((s) => ({ chats: [chat, ...s.chats], selectedChatId: id }));
      if (baseSettings.tutor_mode) primeTutorWelcome(id, { set, get });
      saveChat(chat).catch(() => undefined);
      // Reset ephemeral "next" flags so they only apply to this new chat
      set((s) => ({
        ui: resetEphemeralUi(s.ui),
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
      if (Array.isArray(appliedPartial.parallel_models)) {
        const base = appliedPartial.model ?? before?.settings.model;
        appliedPartial.parallel_models = normalizeParallelModels(base, appliedPartial.parallel_models);
      }
      const ensureTutor = () => {
        const baseSettings = {
          ...(before?.settings || {}),
          ...appliedPartial,
        } as Chat['settings'];
        const ensured = applyTutorDefaults({
          ui: uiState,
          chat: { settings: baseSettings },
          fallbackDefaultModelId: DEFAULT_TUTOR_MODEL_ID,
        });
        const nextSettings = ensured.nextSettings;
        appliedPartial = {
          ...appliedPartial,
          tutor_mode: true,
          model: nextSettings.model,
          tutor_default_model: nextSettings.tutor_default_model,
          enableLearnerModel: nextSettings.enableLearnerModel,
        };
      };

      if (appliedPartial.tutor_mode === true) ensureTutor();
      if (forceTutorMode) ensureTutor();
      set((s) => ({
        chats: s.chats.map((c) => {
          if (c.id !== id) return c;
          const updatedSettings = { ...c.settings, ...appliedPartial };
          // If forceTutorMode is active, never allow tutor_mode to be false
          if (forceTutorMode) updatedSettings.tutor_mode = true;
          if (Array.isArray(updatedSettings.parallel_models)) {
            updatedSettings.parallel_models = normalizeParallelModels(
              updatedSettings.model,
              updatedSettings.parallel_models,
            );
          }
          return { ...c, settings: updatedSettings, updatedAt: Date.now() };
        }),
        ui: { ...s.ui },
      }));
      const chat = get().chats.find((c) => c.id === id)!;
      await saveChat(chat);
      const turnedOn =
        typeof appliedPartial?.tutor_mode === 'boolean' &&
        before &&
        before.settings.tutor_mode !== appliedPartial.tutor_mode &&
        appliedPartial.tutor_mode === true;
      if (turnedOn && !!get().ui.experimentalTutor) {
        Promise.resolve(primeTutorWelcome(id, { set, get })).catch(() => undefined);
      }
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
