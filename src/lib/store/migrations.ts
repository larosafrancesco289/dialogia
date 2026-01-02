import type { PersistedStoreState } from '@/lib/store/types';
import { migrateChatSettingsRecord, migrateGenSettingsRecord } from '@/lib/settings/migrations';
import { isRecord } from '@/lib/utils/guards';

type PersistedState = Record<string, unknown>;

const readBoolean = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const stripDeprecatedUiFields = (ui: Record<string, unknown>): Record<string, unknown> => {
  const next = { ...ui };
  delete next['isStreaming'];
  delete next['nextModel'];
  delete next['nextSearchEnabled'];
  delete next['nextTutorMode'];
  delete next['overrides'];
  delete next['tutorMemoryModelId'];
  delete next['tutorMemoryFrequency'];
  delete next['tutorMemoryAutoUpdate'];
  delete next['tutorGlobalMemory'];
  delete next['tutorMemoryDebugByMessageId'];
  delete next['nextSearchWithBrave'];
  return next;
};

const compactRecord = <T extends Record<string, unknown>>(input: T): T | undefined => {
  const entries = Object.entries(input).filter(([, value]) => value !== undefined);
  return entries.length ? (Object.fromEntries(entries) as T) : undefined;
};

const migrateSearchSettings = <T>(input: T): T => {
  if (!isRecord(input)) return input;
  const next = { ...input } as Record<string, unknown>;
  if ('search_with_brave' in next) {
    if (next.search_enabled == null) next.search_enabled = !!next.search_with_brave;
    if (next.search_provider == null && next.search_with_brave === true) {
      next.search_provider = 'brave';
    }
    delete next['search_with_brave'];
  }
  return next as T;
};

const migrateUiToNested = (ui: Record<string, unknown>): Record<string, unknown> => {
  const base = stripDeprecatedUiFields(ui);
  const baseFlags = isRecord(base.flags) ? base.flags : undefined;
  const baseDebug = isRecord(base.debug) ? base.debug : undefined;
  const baseTutor = isRecord(base.tutor) ? base.tutor : undefined;
  const flags = compactRecord({
    experimentalBrave:
      readBoolean(baseFlags?.experimentalBrave) ?? readBoolean(base.experimentalBrave),
    experimentalTutor:
      readBoolean(baseFlags?.experimentalTutor) ?? readBoolean(base.experimentalTutor),
    enableMultiModelChat:
      readBoolean(baseFlags?.enableMultiModelChat) ?? readBoolean(base.enableMultiModelChat),
  });
  const debug = compactRecord({
    mode: readBoolean(baseDebug?.mode) ?? readBoolean(base.debugMode),
  });
  const tutor = compactRecord({
    contextMode: readString(baseTutor?.contextMode) ?? readString(base.tutorContextMode),
    thesisMode: readBoolean(baseTutor?.thesisMode) ?? readBoolean(base.tutorThesisMode),
    researchMode: readString(baseTutor?.researchMode) ?? readString(base.tutorResearchMode),
    defaultModelId: readString(baseTutor?.defaultModelId) ?? readString(base.tutorDefaultModelId),
    forceMode: readBoolean(baseTutor?.forceMode) ?? readBoolean(base.forceTutorMode),
  });

  return {
    ...(compactRecord({
      showSettings: base.showSettings,
      sidebarCollapsed: base.sidebarCollapsed,
      zdrOnly: base.zdrOnly,
      routePreference: base.routePreference,
    }) || {}),
    ...(flags ? { flags } : {}),
    ...(debug ? { debug } : {}),
    ...(tutor ? { tutor } : {}),
  };
};

export const migrateToV2 = (state: PersistedState): PersistedState => {
  const next: PersistedState = { ...state };

  if (Array.isArray(state.chats)) {
    next.chats = state.chats.map((chat) => {
      if (!isRecord(chat)) return chat;
      const updatedSettings = migrateSearchSettings(chat.settings);
      return { ...chat, settings: updatedSettings };
    });
  }

  if (isRecord(state.messages)) {
    const migratedMessages: Record<string, unknown> = {};
    for (const [chatId, list] of Object.entries(state.messages)) {
      if (!Array.isArray(list)) {
        migratedMessages[chatId] = list;
        continue;
      }
      migratedMessages[chatId] = list.map((message) => {
        if (!isRecord(message)) return message;
        const nextMessage: Record<string, unknown> = { ...message };
        if ('genSettings' in nextMessage) {
          nextMessage.genSettings = migrateSearchSettings(nextMessage.genSettings);
        }
        if ('settings' in nextMessage) {
          nextMessage.settings = migrateSearchSettings(nextMessage.settings);
        }
        return nextMessage;
      });
    }
    next.messages = migratedMessages;
  }

  if (isRecord(state.ui)) {
    next.ui = stripDeprecatedUiFields(state.ui);
  }

  return next;
};

export const migrateToV3 = (state: PersistedState): PersistedState => state;

export const migrateToV4 = (state: PersistedState): PersistedState => {
  const next: PersistedState = { ...state };
  if (isRecord(next.ui)) {
    next.ui = migrateUiToNested(next.ui);
  }
  return next;
};

export const migrateToV5 = (state: PersistedState): PersistedState => {
  const next: PersistedState = { ...state };

  if (Array.isArray(state.chats)) {
    next.chats = state.chats.map((chat) => {
      if (!isRecord(chat)) return chat;
      const { next: settings } = migrateChatSettingsRecord(chat.settings);
      return { ...chat, settings };
    });
  }

  if (isRecord(state.messages)) {
    const migratedMessages: Record<string, unknown> = {};
    for (const [chatId, list] of Object.entries(state.messages)) {
      if (!Array.isArray(list)) {
        migratedMessages[chatId] = list;
        continue;
      }
      migratedMessages[chatId] = list.map((message) => {
        if (!isRecord(message)) return message;
        const nextMessage: Record<string, unknown> = { ...message };
        if ('genSettings' in nextMessage) {
          const { next: genSettings } = migrateGenSettingsRecord(nextMessage.genSettings);
          nextMessage.genSettings = genSettings;
        }
        if ('settings' in nextMessage) {
          const { next: settings } = migrateChatSettingsRecord(nextMessage.settings);
          nextMessage.settings = settings;
        }
        return nextMessage;
      });
    }
    next.messages = migratedMessages;
  }

  return next;
};

export const migrate = (persistedState: unknown, version = 0): PersistedStoreState => {
  if (!isRecord(persistedState)) return {} as PersistedStoreState;
  const currentVersion = version;
  let state: PersistedState = persistedState;
  if (currentVersion < 2) {
    state = migrateToV2(state);
  }
  if (currentVersion < 3) {
    state = migrateToV3(state);
  }
  if (currentVersion < 4) {
    state = migrateToV4(state);
  }
  if (currentVersion < 5) {
    state = migrateToV5(state);
  }
  return state as PersistedStoreState;
};
