import type {
  StoreGetter,
  StoreSetter,
  StoreActions,
  StoreDataState,
  StoreState,
} from '@/lib/store/types';
import { createModelIndex } from '@/lib/models';
import { buildDefaultUIState } from '@/lib/ui/defaults';
import { buildDefaultVoiceState } from '@/lib/voice/types';
import { resolveNotice } from '@/lib/store/notices';

type StoreStateOverrides = Omit<Partial<StoreState>, 'ui' | 'voice'> & {
  ui?: Partial<StoreState['ui']>;
  voice?: Partial<StoreState['voice']>;
};

export function createTestStoreState(overrides: StoreStateOverrides = {}) {
  const noop = (..._args: unknown[]) => {};
  const noopAsync = async (..._args: unknown[]) => {};
  const noopAsyncString = async (..._args: unknown[]) => 'test-chat';
  const noopAsyncOptionalString = async (..._args: unknown[]) => undefined;

  const baseData: StoreDataState = {
    chats: [],
    folders: [],
    messagesById: {},
    messageIdsByChatId: {},
    selectedChatId: undefined,
    models: [],
    modelIndex: createModelIndex([]),
    favoriteModelIds: [],
    hiddenModelIds: [],
    ui: buildDefaultUIState(),
    voice: buildDefaultVoiceState(),
  };

  const baseActions: StoreActions = {
    initializeApp: noopAsync,
    newChat: noopAsync,
    selectChat: noop,
    renameChat: noopAsync,
    deleteChat: noopAsync,
    updateChatSettings: noopAsync,
    moveChatToFolder: noopAsync,
    createFolder: noopAsync,
    renameFolder: noopAsync,
    deleteFolder: noopAsync,
    toggleFolderExpanded: noopAsync,
    setUI: noop,
    setNotice: noop,
    setSearchStatus: noop,
    logTutorResult: noopAsync,
    loadTutorProfileIntoUI: noopAsync,
    primeTutorWelcomePreview: noopAsyncOptionalString,
    prepareTutorWelcomeMessage: noopAsyncOptionalString,
    applyLearnerModelFeedbackFromUser: noopAsync,
    patchTutorEntry: noopAsync,
    setTutorAttemptMcq: noop,
    setTutorAttemptFillBlank: noop,
    setTutorAttemptOpen: noop,
    setTutorPlanProposalStatus: noop,
    loadModels: noopAsync,
    toggleFavoriteModel: noop,
    hideModel: noop,
    unhideModel: noop,
    resetHiddenModels: noop,
    removeModelFromDropdown: noop,
    sendUserMessage: noopAsync,
    branchChatFromMessage: noopAsync,
    stopStreaming: noop,
    regenerateAssistantMessage: noopAsync,
    editUserMessage: noopAsync,
    editAssistantMessage: noopAsync,
    appendAssistantMessage: noopAsync,
    persistTutorStateForMessage: noopAsync,
    setVoiceActive: noop,
    setVoiceConnected: noop,
    setVoiceListening: noop,
    setVoiceSpeaking: noop,
    setVoiceError: noop,
    setVoiceConfig: noop,
    resetVoiceState: noop,
    ensureChatForVoice: noopAsyncString,
    addVoiceUserMessage: noopAsync,
    addVoiceAssistantMessage: noopAsync,
  };

  const base: StoreState = {
    ...baseData,
    ...baseActions,
  };

  const state: StoreState = {
    ...base,
    ...overrides,
    ui: {
      ...base.ui,
      ...(overrides.ui || {}),
    },
    voice: {
      ...base.voice,
      ...(overrides.voice || {}),
    },
  };

  state.setNotice = (notice?: string) => {
    state.ui.notice = resolveNotice(notice);
  };

  const set: StoreSetter = (updater) => {
    const patch = typeof updater === 'function' ? updater(state) : updater;
    if (!patch) return;
    Object.assign(state, patch);
  };

  const get: StoreGetter = () => state;

  return { state, set, get };
}
