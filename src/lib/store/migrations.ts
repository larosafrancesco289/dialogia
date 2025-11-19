import type { StoreState } from '@/lib/store/types';
import { applyNextOverrides, deriveNextPatchFromLegacy } from '@/lib/ui/next';
import { STORE_MIGRATION_VERSION } from '@/lib/db/versions';

type PersistedState = Partial<StoreState> & Record<string, any>;

const CURRENT_VERSION = STORE_MIGRATION_VERSION;

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

const LEGACY_NEXT_KEYS = [
  'nextModel',
  'nextSearchEnabled',
  'nextSearchProvider',
  'nextDeepResearch',
  'nextTutorMode',
  'nextTutorNudge',
  'nextReasoningEffort',
  'nextReasoningTokens',
  'nextSystem',
  'nextTemperature',
  'nextTopP',
  'nextMaxTokens',
  'nextShowThinking',
  'nextShowStats',
  'nextShowToolCallLog',
  'nextShowDebugRawJson',
  'nextParallelModels',
];

const flattenNextOverrides = (ui: Record<string, any>): Record<string, any> => {
  const base = stripDeprecatedUiFields(ui);
  const nextPatch = deriveNextPatchFromLegacy(base as any);
  const merged =
    nextPatch && Object.keys(nextPatch).length > 0 ? applyNextOverrides(base as any, nextPatch) : base;
  const cleaned = { ...merged };
  for (const key of LEGACY_NEXT_KEYS) {
    delete (cleaned as any)[key];
  }
  return cleaned;
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

export const migrateToV3 = (state: PersistedState): PersistedState => {
  const next = { ...state } as PersistedState;
  if (next.ui && typeof next.ui === 'object') {
    next.ui = flattenNextOverrides(next.ui as Record<string, any>) as any;
  }
  return next;
};

export const migrate = (persistedState: unknown, version?: number): Partial<StoreState> => {
  if (!persistedState || typeof persistedState !== 'object') return {};
  const currentVersion = version ?? 0;
  let state = persistedState as PersistedState;
  if (currentVersion < 2) {
    state = migrateToV2(state);
  }
  if (currentVersion < CURRENT_VERSION) {
    state = migrateToV3(state);
  }
  return state;
};
