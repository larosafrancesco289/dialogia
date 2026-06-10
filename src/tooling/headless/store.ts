import { createStore, type StoreApi } from 'zustand/vanilla';
import { createModelIndex } from '@/lib/models';
import type { StoreState, UIState, UIStatePartial } from '@/lib/store/types';
import type { Chat, ChatSettingsPatch, Message, ModelDescriptor } from '@/lib/types';
import { buildDefaultUIState } from '@/lib/ui/defaults';
import { createAssistantMessage } from '@/lib/messages/createMessage';
import { appendMessagesToChat, buildMessageIndex } from '@/lib/messages/indexing';
import { resolveNotice } from '@/lib/store/notices';

export type HeadlessStoreOptions = {
  chat: Chat;
  messages?: Message[];
  models?: ModelDescriptor[];
  modelIndex?: ReturnType<typeof createModelIndex>;
  uiOverrides?: Partial<UIState>;
};

const HEADLESS_UI_OVERRIDES: Partial<UIState> = {
  debug: { mode: true },
  tutor: { forceMode: true },
  overrides: {
    tutorMode: true,
    search: { provider: 'openrouter' },
  },
};

export function createHeadlessStore(options: HeadlessStoreOptions): StoreApi<StoreState> {
  const { chat, messages = [], models = [], uiOverrides, modelIndex } = options;
  const resolvedIndex = modelIndex ?? createModelIndex(models);
  const initialMessages: Record<string, Message[]> = { [chat.id]: messages.slice() };
  const { messagesById, messageIdsByChatId } = buildMessageIndex(initialMessages);

  return createStore<StoreState>((set, _get) => ({
    chats: [chat],
    folders: [],
    messagesById,
    messageIdsByChatId,
    selectedChatId: chat.id,
    loadedMessageChatIds: { [chat.id]: true as const },
    nonEmptyChatIds: messages.length ? { [chat.id]: true as const } : {},
    models,
    modelIndex: resolvedIndex,
    favoriteModelIds: [],
    hiddenModelIds: [],
    zdrModelIds: undefined,
    zdrProviderIds: undefined,
    ui: buildDefaultUIState({
      ...HEADLESS_UI_OVERRIDES,
      ...(uiOverrides ?? {}),
    }),

    initializeApp: async () => {},

    newChat: async () => {},
    selectChat: (id: string) => set({ selectedChatId: id }),
    ensureChatMessagesLoaded: async () => {},
    ensureAllChatMessagesLoaded: async () => {},
    renameChat: async (id: string, title: string) => {
      set((state) => ({
        chats: state.chats.map((c) => (c.id === id ? { ...c, title, updatedAt: Date.now() } : c)),
      }));
    },
    deleteChat: async () => {},
    clearChatMessages: () => {},
    updateChatSettings: async (partial: ChatSettingsPatch) => {
      set((state) => ({
        chats: state.chats.map((c) =>
          c.id === chat.id
            ? {
                ...c,
                settings: {
                  ...c.settings,
                  ...partial,
                  generation: { ...c.settings.generation, ...(partial.generation ?? {}) },
                  ui: { ...c.settings.ui, ...(partial.ui ?? {}) },
                  features: {
                    ...c.settings.features,
                    search: {
                      ...c.settings.features.search,
                      ...(partial.features?.search ?? {}),
                    },
                    tutor: {
                      ...c.settings.features.tutor,
                      ...(partial.features?.tutor ?? {}),
                    },
                  },
                },
                updatedAt: Date.now(),
              }
            : c,
        ),
      }));
    },
    moveChatToFolder: async () => {},

    createFolder: async () => {},
    renameFolder: async () => {},
    deleteFolder: async () => {},
    toggleFolderExpanded: async () => {},

    setUI: (partial: UIStatePartial) =>
      set((state) => {
        const { flags, debug, search, tutor, plan, mobile, ...rest } = partial;
        return {
          ui: {
            ...state.ui,
            ...rest,
            flags: flags ? { ...state.ui.flags, ...flags } : state.ui.flags,
            debug: debug ? { ...state.ui.debug, ...debug } : state.ui.debug,
            search: search ? { ...state.ui.search, ...search } : state.ui.search,
            tutor: tutor ? { ...state.ui.tutor, ...tutor } : state.ui.tutor,
            plan: plan ? { ...state.ui.plan, ...plan } : state.ui.plan,
            mobile: mobile ? { ...state.ui.mobile, ...mobile } : state.ui.mobile,
          },
        };
      }),
    setNotice: (notice) =>
      set((state) => ({
        ui: { ...state.ui, notice: resolveNotice(notice) },
      })),

    logTutorResult: async () => {},
    loadTutorProfileIntoUI: async () => {},
    primeTutorWelcomePreview: async () => undefined,
    prepareTutorWelcomeMessage: async () => undefined,
    applyLearnerModelFeedbackFromUser: async () => {},
    patchTutorEntry: async () => {},
    setTutorAttemptMcq: () => {},
    setTutorPlanProposalStatus: () => {},
    setSearchStatus: () => {},

    loadModels: async () => {},
    toggleFavoriteModel: (id: string) =>
      set((state) => ({
        favoriteModelIds: state.favoriteModelIds.includes(id)
          ? state.favoriteModelIds.filter((x) => x !== id)
          : [...state.favoriteModelIds, id],
      })),
    hideModel: (id: string) =>
      set((state) => ({
        hiddenModelIds: state.hiddenModelIds.includes(id)
          ? state.hiddenModelIds
          : [...state.hiddenModelIds, id],
      })),
    unhideModel: (id: string) =>
      set((state) => ({
        hiddenModelIds: state.hiddenModelIds.filter((x) => x !== id),
      })),
    resetHiddenModels: () => set({ hiddenModelIds: [] }),
    removeModelFromDropdown: () => {},

    sendUserMessage: async () => {},
    branchChatFromMessage: async () => {},
    stopStreaming: () =>
      set((state) => ({
        ui: { ...state.ui, activeTurnByChatId: {} },
      })),
    regenerateAssistantMessage: async () => {},
    editUserMessage: async () => {},
    editAssistantMessage: async () => {},
    appendAssistantMessage: async (content, opts) => {
      const message = createAssistantMessage({
        chatId: chat.id,
        content,
        model: opts?.modelId ?? chat.settings.modelId,
      });
      set((state) => appendMessagesToChat(state, chat.id, [message]));
    },
    persistTutorStateForMessage: async () => {},
  }));
}
