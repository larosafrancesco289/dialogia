import { ChatService } from '@/lib/services/chatService';
import { normalizeParallelModels } from '@/lib/models/normalization';
import { applyTutorDefaults } from '@/lib/store/normalize';
import { primeTutorWelcome } from '@/lib/services/turns';
import { resetEphemeralUi } from '@/lib/ui/defaults';
import { loadRepositorySnapshot } from '@/lib/db';
import { mergeTutorMap } from '@/lib/ui/tutorSelectors';
import { DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';
import type { StoreState } from '@/lib/store/types';
import type { StoreSetter } from '@/lib/agent/types';
import type { Chat } from '@/lib/types';

export function createChatSlice(set: StoreSetter, get: () => StoreState, _store?: unknown) {
  return {
    async initializeApp() {
      const snapshot = await loadRepositorySnapshot(get().selectedChatId);
      set(
        (s) => ({
          chats: snapshot.chats,
          folders: snapshot.folders,
          messages: snapshot.messages,
          selectedChatId: snapshot.selectedChatId,
          ui: mergeTutorMap(s.ui, snapshot.tutorByMessageId),
        }),
      );
      try {
        if (snapshot.selectedChatId) {
          await get().loadTutorProfileIntoUI(snapshot.selectedChatId);
        }
      } catch {
        /* ignore tutor profile preload errors */
      }
    },

    async newChat() {
      const chat = await ChatService.createChat({
        ui: get().ui,
        chats: get().chats,
        selectedChatId: get().selectedChatId,
      });

      set((s) => ({ chats: [chat, ...s.chats], selectedChatId: chat.id }));

      if (chat.settings.tutor_mode) primeTutorWelcome(chat.id, { set, get });

      // Reset ephemeral "next" flags so they only apply to this new chat
      set((s) => ({
        ui: resetEphemeralUi(s.ui),
      }));
    },

    selectChat(id: string) {
      set({ selectedChatId: id });
    },

    async renameChat(id: string, title: string) {
      const chat = get().chats.find((c) => c.id === id);
      if (!chat) return;
      const updated = await ChatService.updateChat(chat, { title });
      set((s) => ({
        chats: s.chats.map((c) => (c.id === id ? updated : c)),
      }));
    },

    async deleteChat(id: string) {
      await ChatService.deleteChat(id);
      set((s) => {
        const chats = s.chats.filter((c) => c.id !== id);
        const selectedChatId = s.selectedChatId === id ? chats[0]?.id : s.selectedChatId;
        const { [id]: _, ...rest } = s.messages;
        return { chats, messages: rest, selectedChatId };
      });
    },

    async branchChatFromMessage(messageId: string) {
      const st = get();
      let sourceChatId: string | undefined;
      for (const [cid, list] of Object.entries(st.messages)) {
        const idx = list.findIndex((m) => m.id === messageId);
        if (idx >= 0) {
          sourceChatId = cid;
          break;
        }
      }
      if (!sourceChatId) return;
      const sourceChat = st.chats.find((c) => c.id === sourceChatId);
      if (!sourceChat) return;
      const sourceMessages = st.messages[sourceChatId] || [];

      const result = await ChatService.branchChat({
        sourceChat,
        messages: sourceMessages,
        messageId,
      });

      if (!result) return;

      set((s) => ({
        chats: [result.chat, ...s.chats],
        messages: { ...s.messages, [result.chat.id]: result.messages },
        selectedChatId: result.chat.id,
      }));
    },

    async updateChatSettings(partial) {
      const id = get().selectedChatId;
      if (!id) return;
      const before = get().chats.find((c) => c.id === id);
      if (!before) return;

      const uiState = get().ui;
      const forceTutorMode = !!(uiState.tutor.forceMode ?? false);
      let appliedPartial = { ...partial } as Partial<Chat['settings']>;

      if (Array.isArray(appliedPartial.parallel_models)) {
        const base = appliedPartial.model ?? before.settings.model;
        appliedPartial.parallel_models = normalizeParallelModels(
          base,
          appliedPartial.parallel_models,
        );
      }

      const ensureTutor = () => {
        const baseSettings = {
          ...(before.settings || {}),
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

      const finalSettings = { ...before.settings, ...appliedPartial };
      if (forceTutorMode) finalSettings.tutor_mode = true;
      if (Array.isArray(finalSettings.parallel_models)) {
        finalSettings.parallel_models = normalizeParallelModels(
          finalSettings.model,
          finalSettings.parallel_models,
        );
      }

      const updatedChat = await ChatService.updateChat(before, { settings: finalSettings });

      set((s) => ({
        chats: s.chats.map((c) => (c.id === id ? updatedChat : c)),
        ui: { ...s.ui },
      }));

      const turnedOn =
        typeof appliedPartial?.tutor_mode === 'boolean' &&
        before.settings.tutor_mode !== appliedPartial.tutor_mode &&
        appliedPartial.tutor_mode === true;

      if (turnedOn && !!get().ui.flags.experimentalTutor) {
        Promise.resolve(primeTutorWelcome(id, { set, get })).catch(() => undefined);
      }
    },

    async moveChatToFolder(chatId: string, folderId?: string) {
      const chat = get().chats.find((c) => c.id === chatId);
      if (!chat) return;
      const updated = await ChatService.moveChatToFolder(chat, folderId);
      set((s) => ({
        chats: s.chats.map((c) => (c.id === chatId ? updated : c)),
      }));
    },

    async createFolder(name: string, parentId?: string) {
      const folder = await ChatService.createFolder(name, parentId);
      set((s) => ({ folders: [...s.folders, folder] }));
    },

    async renameFolder(id: string, name: string) {
      const folder = get().folders.find((f) => f.id === id);
      if (!folder) return;
      const updated = await ChatService.updateFolder(folder, { name });
      set((s) => ({
        folders: s.folders.map((f) => (f.id === id ? updated : f)),
      }));
    },

    async deleteFolder(id: string) {
      const { updatedChats, updatedFolders } = await ChatService.deleteFolder(
        id,
        get().chats,
        get().folders,
      );

      set((s) => {
        const chatMap = new Map(s.chats.map((c) => [c.id, c]));
        for (const u of updatedChats) chatMap.set(u.id, u);

        const folderMap = new Map(s.folders.map((f) => [f.id, f]));
        for (const u of updatedFolders) folderMap.set(u.id, u);
        folderMap.delete(id);

        return {
          chats: Array.from(chatMap.values()),
          folders: Array.from(folderMap.values()),
        };
      });
    },

    async toggleFolderExpanded(id: string) {
      const folder = get().folders.find((f) => f.id === id);
      if (!folder) return;
      const updated = await ChatService.updateFolder(folder, { isExpanded: !folder.isExpanded });
      set((s) => ({
        folders: s.folders.map((f) => (f.id === id ? updated : f)),
      }));
    },
  } satisfies Partial<StoreState>;
}
