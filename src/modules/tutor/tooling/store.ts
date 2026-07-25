import { createStore, type StoreApi } from 'zustand/vanilla';
import type { StateCreator } from 'zustand';
import { createModelIndex } from '@/lib/models';
import { buildStoreInitializer } from '@/lib/store/createStore';
import type { StoreState, UIState } from '@/lib/store/types';
import type { Chat, ChatSettingsPatch, Message, ModelDescriptor } from '@/lib/types';
import { buildDefaultUIState } from '@/lib/ui/defaults';
import { createAssistantMessage } from '@/lib/messages/createMessage';
import { appendMessagesToChat, buildMessageIndex } from '@/lib/messages/indexing';

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

/**
 * Builds a store from the real slices, then replaces only the actions that would
 * otherwise touch the network or IndexedDB. Adding a store field or action needs
 * no edit here.
 */
export function createHeadlessStore(options: HeadlessStoreOptions): StoreApi<StoreState> {
  const { chat, messages = [], models = [], uiOverrides, modelIndex } = options;
  const resolvedIndex = modelIndex ?? createModelIndex(models);
  const initialMessages: Record<string, Message[]> = { [chat.id]: messages.slice() };
  const { messagesById, messageIdsByChatId } = buildMessageIndex(initialMessages);

  const initializer = buildStoreInitializer() as unknown as StateCreator<StoreState>;

  return createStore<StoreState>((set, get, store) => {
    const base = initializer(set, get, store);
    const noop = async () => {};

    return {
      ...base,

      chats: [chat],
      folders: [],
      messagesById,
      messageIdsByChatId,
      selectedChatId: chat.id,
      loadedMessageChatIds: { [chat.id]: true as const },
      nonEmptyChatIds: messages.length ? { [chat.id]: true as const } : {},
      models,
      modelIndex: resolvedIndex,
      ui: buildDefaultUIState({
        ...HEADLESS_UI_OVERRIDES,
        ...(uiOverrides ?? {}),
      }),

      // Persistence-free stand-ins: the harness has no IndexedDB and no network.
      initializeApp: noop,
      newChat: noop,
      ensureChatMessagesLoaded: noop,
      ensureAllChatMessagesLoaded: noop,
      deleteChat: noop,
      clearChatMessages: () => {},
      moveChatToFolder: noop,
      createFolder: noop,
      renameFolder: noop,
      deleteFolder: noop,
      toggleFolderExpanded: noop,
      loadModels: noop,
      removeModelFromDropdown: () => {},
      sendUserMessage: noop,
      branchChatFromMessage: noop,
      regenerateAssistantMessage: noop,
      editUserMessage: noop,
      editAssistantMessage: noop,
      persistTutorStateForMessage: noop,
      logTutorResult: noop,
      loadTutorProfileIntoUI: noop,
      primeTutorWelcomePreview: async () => undefined,
      prepareTutorWelcomeMessage: async () => undefined,
      applyLearnerModelFeedbackFromUser: noop,
      patchTutorEntry: noop,

      renameChat: async (id: string, title: string) => {
        set((state) => ({
          chats: state.chats.map((c) => (c.id === id ? { ...c, title, updatedAt: Date.now() } : c)),
        }));
      },
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
      appendAssistantMessage: async (content: string, opts?: { modelId?: string }) => {
        const message = createAssistantMessage({
          chatId: chat.id,
          content,
          model: opts?.modelId ?? chat.settings.modelId,
        });
        set((state) => appendMessagesToChat(state, chat.id, [message]));
      },
    };
  });
}
