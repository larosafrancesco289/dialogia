import { v4 as uuidv4 } from 'uuid';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { createModelIndex } from '@/lib/models';
import type { StoreState, UIState } from '@/lib/store/types';
import type { Chat, Message, ORModel } from '@/lib/types';
import { buildDefaultUIState } from '@/lib/ui/defaults';
import { buildDefaultVoiceState } from '@/lib/voice/constants';

export type HeadlessStoreOptions = {
  chat: Chat;
  messages?: Message[];
  models?: ORModel[];
  modelIndex?: ReturnType<typeof createModelIndex>;
  uiOverrides?: Partial<UIState>;
};

const HEADLESS_UI_OVERRIDES: Partial<UIState> = {
  debugMode: true,
  forceTutorMode: true,
  next: {
    tutorMode: true,
    search: { provider: 'openrouter' },
  },
};

export function createHeadlessStore(options: HeadlessStoreOptions): StoreApi<StoreState> {
  const { chat, messages = [], models = [], uiOverrides, modelIndex } = options;
  const resolvedIndex = modelIndex ?? createModelIndex(models);
  const initialMessages: Record<string, Message[]> = { [chat.id]: messages.slice() };

  return createStore<StoreState>((set, _get) => ({
    chats: [chat],
    folders: [],
    messages: initialMessages,
    selectedChatId: chat.id,
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
    voice: buildDefaultVoiceState(),

    initializeApp: async () => {},

    newChat: async () => {},
    selectChat: (id: string) => set({ selectedChatId: id }),
    renameChat: async (id: string, title: string) => {
      set((state) => ({
        chats: state.chats.map((c) => (c.id === id ? { ...c, title, updatedAt: Date.now() } : c)),
      }));
    },
    deleteChat: async () => {},
    updateChatSettings: async (partial) => {
      set((state) => ({
        chats: state.chats.map((c) =>
          c.id === chat.id
            ? { ...c, settings: { ...c.settings, ...partial }, updatedAt: Date.now() }
            : c,
        ),
      }));
    },
    moveChatToFolder: async () => {},

    createFolder: async () => {},
    renameFolder: async () => {},
    deleteFolder: async () => {},
    toggleFolderExpanded: async () => {},

    setUI: (partial) =>
      set((state) => ({
        ui: { ...state.ui, ...partial },
      })),

    logTutorResult: async () => {},
    loadTutorProfileIntoUI: async () => {},
    primeTutorWelcomePreview: async () => undefined,
    prepareTutorWelcomeMessage: async () => undefined,
    applyLearnerModelFeedbackFromUser: async () => {},

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
    stopStreaming: () => set((state) => ({ ui: { ...state.ui, isStreaming: false } })),
    regenerateAssistantMessage: async () => {},
    editUserMessage: async () => {},
    editAssistantMessage: async () => {},
    appendAssistantMessage: async (content, opts) => {
      const message: Message = {
        id: uuidv4(),
        chatId: chat.id,
        role: 'assistant',
        content,
        createdAt: Date.now(),
        model: opts?.modelId ?? chat.settings.model,
        reasoning: '',
        toolCalls: [],
      };
      set((state) => {
        const list = state.messages[chat.id] ?? [];
        return {
          messages: {
            ...state.messages,
            [chat.id]: [...list, message],
          },
        };
      });
    },
    persistTutorStateForMessage: async () => {},

    // Voice actions (no-ops for headless mode)
    startVoiceMode: () => {},
    stopVoiceMode: () => {},
    setVoiceMode: () => {},
    startRecording: async () => {},
    stopRecording: () => {},
    interruptPlayback: () => {},
    updatePartialTranscript: () => {},
    commitTranscript: () => {},
    appendLlmText: () => {},
    completeLlmResponse: () => {},
    queueAudio: () => {},
    playNextAudio: () => {},
    clearAudioQueue: () => {},
    setIsPlaying: () => {},
    setAudioLevel: () => {},
    setRecordingDuration: () => {},
    setVoiceConfig: () => {},
    setVoiceError: () => {},
    clearVoiceError: () => {},
    resetVoiceState: () => {},
    updateMetrics: () => {},
  }));
}
