import { ChatService } from '@/lib/services/chatService';
import { applyModuleSettingsDefaults } from '@/lib/settings/moduleDefaults';
import { resetEphemeralUi } from '@/lib/ui/defaults';
import { repository } from '@/lib/db';
import { bootstrapApp } from '@/lib/services/bootstrap';
import { settingsEqual } from '@/lib/settings/equality';
import { mergeChatDefaults } from '@/lib/settings/chatDefaults';
import type { PersistFragment, StoreSetter, StoreState } from '@/lib/store/types';
import type * as TurnService from '@/lib/services/turns';
import type { Chat, ChatSettingsPatch, Folder } from '@/lib/types';
import { getClientTier } from '@/lib/auth/tier.client';
import {
  appendMessagesToChat,
  getMessagesForChat,
  removeChatMessages,
  setMessagesForChat,
} from '@/lib/messages/indexing';
import { hydrateMessageList } from '@/lib/services/hydrate';
import { mergeTutorMap } from '@/lib/ui/tutorState';

// Keeps the turn pipeline out of the boot bundle; welcome priming is user-triggered
// and fire-and-forget, so the deferred load is invisible to callers.
function primeTutorWelcome(...args: Parameters<typeof TurnService.primeTutorWelcome>) {
  void import('@/lib/services/turns')
    .then((mod) => mod.primeTutorWelcome(...args))
    .catch(() => undefined);
}

export type ChatSliceState = {
  chats: Chat[];
  folders: Folder[];
  selectedChatId?: string;
  // Lazy hydration bookkeeping (ephemeral): chats whose messages are in
  // memory, and chats known to have persisted messages not yet loaded.
  loadedMessageChatIds: Record<string, true>;
  nonEmptyChatIds: Record<string, true>;
};

export type ChatSliceActions = {
  initializeApp: () => Promise<void>;
  newChat: () => Promise<void>;
  selectChat: (id: string) => void;
  ensureChatMessagesLoaded: (chatId: string) => Promise<void>;
  ensureAllChatMessagesLoaded: () => Promise<void>;
  renameChat: (id: string, title: string) => Promise<void>;
  deleteChat: (id: string) => Promise<void>;
  clearChatMessages: (chatId?: string) => void;
  branchChatFromMessage: (messageId: string) => Promise<void>;
  updateChatSettings: (partial: ChatSettingsPatch) => Promise<void>;
  moveChatToFolder: (chatId: string, folderId?: string) => Promise<void>;
  createFolder: (name: string, parentId?: string) => Promise<void>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  toggleFolderExpanded: (id: string) => Promise<void>;
};

export const chatPersistFragment: PersistFragment = {
  partialize: (state) => ({ selectedChatId: state.selectedChatId }),
};

export function createChatSlice(
  set: StoreSetter,
  get: () => StoreState,
  _store?: unknown,
): ChatSliceState & ChatSliceActions {
  const inflightMessageLoads = new Map<string, Promise<void>>();

  const findLatestEmptyDraft = (state: StoreState): Chat | undefined => {
    let candidate: Chat | undefined;
    for (const chat of state.chats) {
      if (chat.title !== 'New Chat') continue;
      // A chat whose messages have not been loaded yet may still have
      // persisted history; never treat it as a reusable empty draft.
      if (!state.loadedMessageChatIds?.[chat.id] && state.nonEmptyChatIds?.[chat.id]) continue;
      if (getMessagesForChat(state, chat.id).length > 0) continue;
      const candidateStamp = candidate?.updatedAt ?? candidate?.createdAt ?? -Infinity;
      const chatStamp = chat.updatedAt ?? chat.createdAt ?? 0;
      if (!candidate || chatStamp > candidateStamp) candidate = chat;
    }
    return candidate;
  };

  const markChatLoaded = (state: StoreState, chatId: string): Partial<StoreState> =>
    state.loadedMessageChatIds?.[chatId]
      ? {}
      : { loadedMessageChatIds: { ...(state.loadedMessageChatIds ?? {}), [chatId]: true } };

  return {
    chats: [],
    folders: [],
    selectedChatId: undefined,
    loadedMessageChatIds: {},
    nonEmptyChatIds: {},

    async initializeApp() {
      await bootstrapApp(set, get);
    },

    async newChat() {
      const snapshot = get();
      const reusableDraft = findLatestEmptyDraft(snapshot);

      if (reusableDraft) {
        const refreshedSettings = ChatService.buildSettingsForNewChat({
          ui: snapshot.ui,
          chats: snapshot.chats,
          selectedChatId: snapshot.selectedChatId,
          tier: getClientTier(),
          models: snapshot.models,
        });
        const nextDraft = settingsEqual(reusableDraft.settings, refreshedSettings)
          ? reusableDraft
          : await ChatService.updateChat(
              reusableDraft,
              { settings: refreshedSettings },
              repository,
            );

        set((s) => ({
          chats: s.chats.map((c) => (c.id === nextDraft.id ? nextDraft : c)),
          selectedChatId: nextDraft.id,
          ...markChatLoaded(s, nextDraft.id),
          ui: resetEphemeralUi({
            ...s.ui,
            plan: { ...s.ui.plan, sheetOpen: false, sheetPlanOverride: null },
          }),
        }));

        if (nextDraft.settings.features.tutor?.enabled) {
          primeTutorWelcome(nextDraft.id, { set, get });
        }
        return;
      }

      const chat = await ChatService.createChat({
        ui: snapshot.ui,
        chats: snapshot.chats,
        selectedChatId: snapshot.selectedChatId,
        repository,
        tier: getClientTier(),
        models: snapshot.models,
      });

      set((s) => ({
        chats: [chat, ...s.chats],
        selectedChatId: chat.id,
        ...markChatLoaded(s, chat.id),
        ui: resetEphemeralUi(s.ui),
      }));

      if (chat.settings.features.tutor?.enabled) primeTutorWelcome(chat.id, { set, get });
    },

    selectChat(id: string) {
      void get()
        .ensureChatMessagesLoaded(id)
        .catch(() => undefined);
      set((s) => ({
        selectedChatId: id,
        ui: {
          ...s.ui,
          plan: {
            ...s.ui.plan,
            sheetOpen: false,
            sheetPlanOverride: null,
          },
        },
      }));
    },

    async ensureChatMessagesLoaded(chatId: string) {
      if (!chatId) return;
      if (get().loadedMessageChatIds[chatId]) return;
      const inflight = inflightMessageLoads.get(chatId);
      if (inflight) return inflight;
      const load = (async () => {
        try {
          const list = await repository.loadMessagesForChat(chatId);
          const { messages, tutorByMessageId } = hydrateMessageList(list);
          set((s) => ({
            // Merge instead of replace: messages sent while the load was in
            // flight must survive (append dedupes by id).
            ...appendMessagesToChat(s, chatId, messages),
            ...markChatLoaded(s, chatId),
            ui: mergeTutorMap(s.ui, tutorByMessageId),
          }));
        } finally {
          inflightMessageLoads.delete(chatId);
        }
      })();
      inflightMessageLoads.set(chatId, load);
      return load;
    },

    async ensureAllChatMessagesLoaded() {
      const chatIds = get().chats.map((chat) => chat.id);
      for (const chatId of chatIds) {
        await get()
          .ensureChatMessagesLoaded(chatId)
          .catch(() => undefined);
      }
    },

    async renameChat(id: string, title: string) {
      const chat = get().chats.find((c) => c.id === id);
      if (!chat) return;
      const updated = await ChatService.updateChat(chat, { title }, repository);
      set((s) => ({
        chats: s.chats.map((c) => (c.id === id ? updated : c)),
      }));
    },

    async deleteChat(id: string) {
      await ChatService.deleteChat(id, repository);
      set((s) => {
        const chats = s.chats.filter((c) => c.id !== id);
        const deletingSelectedChat = s.selectedChatId === id;
        const selectedChatId = deletingSelectedChat ? chats[0]?.id : s.selectedChatId;
        const loadedMessageChatIds = { ...(s.loadedMessageChatIds ?? {}) };
        delete loadedMessageChatIds[id];
        const nonEmptyChatIds = { ...(s.nonEmptyChatIds ?? {}) };
        delete nonEmptyChatIds[id];
        return {
          chats,
          selectedChatId,
          loadedMessageChatIds,
          nonEmptyChatIds,
          ...removeChatMessages(s, id),
          ...(deletingSelectedChat
            ? {
                ui: {
                  ...s.ui,
                  plan: {
                    ...s.ui.plan,
                    rightPanelOpen: false,
                    sheetOpen: false,
                    sheetPlanOverride: null,
                  },
                },
              }
            : {}),
        };
      });
      // Falling back to another chat after deletion may select one whose
      // messages have not been loaded yet.
      const nextSelected = get().selectedChatId;
      if (nextSelected) {
        void get()
          .ensureChatMessagesLoaded(nextSelected)
          .catch(() => undefined);
      }
    },

    clearChatMessages(chatId?: string) {
      const id = chatId || get().selectedChatId;
      if (!id) return;
      set((s) => removeChatMessages(s, id));
    },

    async branchChatFromMessage(messageId: string) {
      const st = get();
      const sourceChatId = st.messagesById[messageId]?.chatId;
      if (!sourceChatId) return;
      const sourceChat = st.chats.find((c) => c.id === sourceChatId);
      if (!sourceChat) return;
      const sourceMessages = getMessagesForChat(st, sourceChatId);

      const result = await ChatService.branchChat({
        sourceChat,
        messages: sourceMessages,
        messageId,
        repository,
      });

      if (!result) return;

      set((s) => ({
        chats: [result.chat, ...s.chats],
        selectedChatId: result.chat.id,
        ...setMessagesForChat(s, result.chat.id, result.messages),
        ...markChatLoaded(s, result.chat.id),
        nonEmptyChatIds: { ...(s.nonEmptyChatIds ?? {}), [result.chat.id]: true as const },
      }));
    },

    async updateChatSettings(partial: ChatSettingsPatch) {
      const id = get().selectedChatId;
      if (!id) return;
      const before = get().chats.find((c) => c.id === id);
      if (!before) return;

      const uiState = get().ui;
      const fallbackUi = {
        showThinkingByDefault: false,
        showStats: false,
        showToolCallLog: false,
        showDebugRawJson: true,
      };
      const fallbackFeatures = {
        search: { enabled: false, provider: 'openrouter' as const },
        tutor: { enabled: false },
      };

      const mergeSettings = (
        base: Chat['settings'],
        patch: ChatSettingsPatch,
      ): Chat['settings'] => {
        const baseGeneration = base.generation ?? {};
        const baseUi = base.ui ?? fallbackUi;
        const baseFeatures = base.features ?? fallbackFeatures;
        const patchFeatures = patch.features;
        const baseSearch = baseFeatures.search ?? fallbackFeatures.search;
        const baseTutor = baseFeatures.tutor ?? fallbackFeatures.tutor;

        return {
          ...base,
          ...patch,
          generation: { ...baseGeneration, ...(patch.generation ?? {}) },
          ui: { ...baseUi, ...(patch.ui ?? {}) },
          features: {
            ...baseFeatures,
            search: { ...baseSearch, ...(patchFeatures?.search ?? {}) },
            tutor: { ...baseTutor, ...(patchFeatures?.tutor ?? {}) },
          },
        };
      };

      let nextSettings = mergeSettings(before.settings, partial);

      // Switching model returns reasoning to the new model's own default:
      // an effort chosen for the previous model must not silently carry over
      // to a model with different levels and defaults.
      const hasOwn = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);
      const modelChanged =
        hasOwn(partial, 'modelId') &&
        typeof partial.modelId === 'string' &&
        partial.modelId !== before.settings.modelId;
      const patchSetsReasoning =
        !!partial.generation &&
        (hasOwn(partial.generation, 'reasoningEffort') ||
          hasOwn(partial.generation, 'reasoningTokens'));
      const resetReasoningForModelChange = modelChanged && !patchSetsReasoning;
      if (resetReasoningForModelChange) {
        nextSettings = {
          ...nextSettings,
          generation: {
            ...nextSettings.generation,
            reasoningEffort: undefined,
            reasoningTokens: undefined,
          },
        };
      }

      const withModuleDefaults = applyModuleSettingsDefaults({
        chat: { settings: nextSettings },
        ui: uiState,
        phase: 'write',
      });
      if (withModuleDefaults.changed) nextSettings = withModuleDefaults.nextSettings;

      const updatedChat = await ChatService.updateChat(
        before,
        { settings: nextSettings },
        repository,
      );

      // In-chat changes to model and reasoning become the sticky defaults for
      // future chats, so a new chat continues where the user left off. Search
      // intentionally does not stick: tool toggles reset per chat so a
      // research session doesn't quietly add search cost to every future
      // message. Tutor chats are excluded: their model is managed by tutor
      // defaults and must not leak into regular chats.
      const isTutorChat = nextSettings.features.tutor?.enabled;
      const stickyGeneration = partial.generation
        ? {
            ...(hasOwn(partial.generation, 'reasoningEffort')
              ? { reasoningEffort: nextSettings.generation.reasoningEffort }
              : {}),
            ...(hasOwn(partial.generation, 'reasoningTokens')
              ? { reasoningTokens: nextSettings.generation.reasoningTokens }
              : {}),
          }
        : resetReasoningForModelChange
          ? // The model switch dropped the explicit effort; drop the sticky
            // default too so future chats follow the new model's default.
            { reasoningEffort: undefined, reasoningTokens: undefined }
          : {};
      const stickyDefaults = {
        ...(!isTutorChat && hasOwn(partial, 'modelId') ? { modelId: nextSettings.modelId } : {}),
        ...(Object.keys(stickyGeneration).length ? { generation: stickyGeneration } : {}),
      };

      set((s) => ({
        chats: s.chats.map((c) => (c.id === id ? updatedChat : c)),
        ui: {
          ...s.ui,
          chatDefaults: Object.keys(stickyDefaults).length
            ? mergeChatDefaults(s.ui.chatDefaults, stickyDefaults)
            : s.ui.chatDefaults,
        },
      }));

      const turnedOn =
        before.settings.features.tutor?.enabled !== nextSettings.features.tutor?.enabled &&
        nextSettings.features.tutor?.enabled === true;

      if (turnedOn && !!get().ui.flags.experimentalTutor) {
        Promise.resolve(primeTutorWelcome(id, { set, get })).catch(() => undefined);
      }
    },

    async moveChatToFolder(chatId: string, folderId?: string) {
      const chat = get().chats.find((c) => c.id === chatId);
      if (!chat) return;
      const updated = await ChatService.moveChatToFolder(chat, folderId, repository);
      set((s) => ({
        chats: s.chats.map((c) => (c.id === chatId ? updated : c)),
      }));
    },

    async createFolder(name: string, parentId?: string) {
      const folder = await ChatService.createFolder(name, parentId, repository);
      set((s) => ({ folders: [...s.folders, folder] }));
    },

    async renameFolder(id: string, name: string) {
      const folder = get().folders.find((f) => f.id === id);
      if (!folder) return;
      const updated = await ChatService.updateFolder(folder, { name }, repository);
      set((s) => ({
        folders: s.folders.map((f) => (f.id === id ? updated : f)),
      }));
    },

    async deleteFolder(id: string) {
      const { updatedChats, updatedFolders } = await ChatService.deleteFolder(
        id,
        get().chats,
        get().folders,
        repository,
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
      const updated = await ChatService.updateFolder(
        folder,
        { isExpanded: !folder.isExpanded },
        repository,
      );
      set((s) => ({
        folders: s.folders.map((f) => (f.id === id ? updated : f)),
      }));
    },
  } satisfies Partial<StoreState>;
}
