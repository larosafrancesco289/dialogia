import type { PersistedStoreState } from '@/lib/store/types';
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
  delete next['experimentalBrave'];
  return next;
};

const compactRecord = <T extends Record<string, unknown>>(input: T): T | undefined => {
  const entries = Object.entries(input).filter(([, value]) => value !== undefined);
  return entries.length ? (Object.fromEntries(entries) as T) : undefined;
};

const migrateUiToNested = (ui: Record<string, unknown>): Record<string, unknown> => {
  const base = stripDeprecatedUiFields(ui);
  const baseFlags = isRecord(base.flags) ? base.flags : undefined;
  const baseDebug = isRecord(base.debug) ? base.debug : undefined;
  const baseTutor = isRecord(base.tutor) ? base.tutor : undefined;
  const flags = compactRecord({
    experimentalTutor:
      readBoolean(baseFlags?.experimentalTutor) ?? readBoolean(base.experimentalTutor),
  });
  const debug = compactRecord({
    mode: readBoolean(baseDebug?.mode) ?? readBoolean(base.debugMode),
  });
  const tutor = compactRecord({
    contextMode: readString(baseTutor?.contextMode) ?? readString(base.tutorContextMode),
    researchMode: readString(baseTutor?.researchMode) ?? readString(base.tutorResearchMode),
    defaultModelId: readString(baseTutor?.defaultModelId) ?? readString(base.tutorDefaultModelId),
    forceMode: readBoolean(baseTutor?.forceMode) ?? readBoolean(base.forceTutorMode),
  });

  return {
    ...(compactRecord({
      showSettings: base.showSettings,
      sidebarCollapsed: base.sidebarCollapsed,
      zdrOnly: base.zdrOnly,
    }) || {}),
    ...(flags ? { flags } : {}),
    ...(debug ? { debug } : {}),
    ...(tutor ? { tutor } : {}),
  };
};

export const migrateToV2 = (state: PersistedState): PersistedState => {
  const next: PersistedState = { ...state };

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

// V5 and V6 are no-ops — the version bumps invalidate stale caches
// (chatDefaults was introduced as a persisted field at v6).

export const migrate = (persistedState: unknown, version = 0): PersistedStoreState => {
  if (!isRecord(persistedState)) return {} as PersistedStoreState;
  let state: PersistedState = persistedState;
  if (version < 2) state = migrateToV2(state);
  if (version < 3) state = migrateToV3(state);
  if (version < 4) state = migrateToV4(state);
  return state as PersistedStoreState;
};
