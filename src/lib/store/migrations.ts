import type { StoreState } from '@/lib/store/types';

type PersistedState = Partial<StoreState> & Record<string, any>;

const CURRENT_VERSION = 2;

const stripDeprecatedUiFields = (ui: Record<string, any>): Record<string, any> => {
  const next = { ...ui };
  delete next.tutorMemoryModelId;
  delete next.tutorMemoryFrequency;
  delete next.tutorMemoryAutoUpdate;
  delete next.tutorGlobalMemory;
  delete next.tutorMemoryDebugByMessageId;
  if ('nextSearchWithBrave' in next) {
    if (next.nextSearchEnabled == null) next.nextSearchEnabled = !!next.nextSearchWithBrave;
    delete next.nextSearchWithBrave;
  }
  return next;
};

const migrateSearchSettings = (input: any) => {
  if (!input || typeof input !== 'object') return input;
  const next = { ...input };
  if ('search_with_brave' in next) {
    if (next.search_enabled == null) next.search_enabled = !!next.search_with_brave;
    delete next.search_with_brave;
  }
  return next;
};

export const migrateToV2 = (state: PersistedState): PersistedState => {
  const next: PersistedState = { ...state };

  if (Array.isArray(state.chats)) {
    next.chats = state.chats.map((chat) => {
      if (!chat || typeof chat !== 'object') return chat;
      const updatedSettings = migrateSearchSettings((chat as any).settings);
      return { ...chat, settings: updatedSettings };
    });
  }

  if (state.messages && typeof state.messages === 'object') {
    const migratedMessages: Record<string, any[]> = {};
    for (const [chatId, list] of Object.entries(state.messages as any)) {
      if (!Array.isArray(list)) {
        migratedMessages[chatId] = list as any;
        continue;
      }
      migratedMessages[chatId] = list.map((message: any) => {
        if (!message || typeof message !== 'object') return message;
        const nextMessage = { ...message };
        if (nextMessage.genSettings && typeof nextMessage.genSettings === 'object') {
          nextMessage.genSettings = migrateSearchSettings(nextMessage.genSettings);
        }
        if (nextMessage.settings && typeof nextMessage.settings === 'object') {
          nextMessage.settings = migrateSearchSettings(nextMessage.settings);
        }
        return nextMessage;
      });
    }
    next.messages = migratedMessages as any;
  }

  if (state.ui && typeof state.ui === 'object') {
    next.ui = stripDeprecatedUiFields(state.ui as Record<string, any>) as any;
  }

  return next;
};

export const migrate = (persistedState: unknown, version?: number): Partial<StoreState> => {
  if (!persistedState || typeof persistedState !== 'object') return {};
  const state = persistedState as PersistedState;
  if ((version ?? 0) >= CURRENT_VERSION) return state;
  return migrateToV2(state);
};

