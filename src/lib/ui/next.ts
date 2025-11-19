import type { UIState, UINextOverrides } from '@/lib/store/types';

type NestedFields = 'search' | 'reasoning' | 'show';

const mergeNested = <T extends Record<string, unknown>>(
  current?: T,
  patch?: T,
): T | undefined => {
  if (!patch) return current;
  const base = current || {};
  const next = { ...base, ...patch };
  const entries = Object.entries(next).filter(([, value]) => value !== undefined);
  return entries.length ? (Object.fromEntries(entries) as T) : undefined;
};

const pruneNext = (next: UINextOverrides): UINextOverrides | undefined => {
  const cleaned: UINextOverrides = {
    ...next,
    search: mergeNested(next.search),
    reasoning: mergeNested(next.reasoning),
    show: mergeNested(next.show),
  };
  const entries = Object.entries(cleaned).filter(([, value]) => value !== undefined);
  return entries.length ? (Object.fromEntries(entries) as UINextOverrides) : undefined;
};

export const readNextOverrides = (ui: UIState): UINextOverrides => {
  const base = ui.next ?? {};
  const legacy = ui as Record<string, any>;
  return {
    ...base,
    model: base.model ?? legacy.nextModel,
    search: {
      enabled: base.search?.enabled ?? legacy.nextSearchEnabled,
      provider: base.search?.provider ?? legacy.nextSearchProvider,
    },
    deepResearch: base.deepResearch ?? legacy.nextDeepResearch,
    tutorMode: base.tutorMode ?? legacy.nextTutorMode,
    tutorNudge: base.tutorNudge ?? legacy.nextTutorNudge,
    reasoning: {
      effort: base.reasoning?.effort ?? legacy.nextReasoningEffort,
      tokens: base.reasoning?.tokens ?? legacy.nextReasoningTokens,
    },
    system: base.system ?? legacy.nextSystem,
    temperature: base.temperature ?? legacy.nextTemperature,
    topP: base.topP ?? legacy.nextTopP,
    maxTokens: base.maxTokens ?? legacy.nextMaxTokens,
    show: {
      thinking: base.show?.thinking ?? legacy.nextShowThinking,
      stats: base.show?.stats ?? legacy.nextShowStats,
      toolCallLog: base.show?.toolCallLog ?? legacy.nextShowToolCallLog,
      debugRawJson: base.show?.debugRawJson ?? legacy.nextShowDebugRawJson,
    },
    parallelModels: base.parallelModels ?? legacy.nextParallelModels,
  };
};

export const applyNextOverrides = (
  ui: UIState,
  patch: Partial<UINextOverrides>,
): UIState => {
  const current = readNextOverrides(ui);
  const merged: UINextOverrides = {
    ...current,
    ...patch,
    search: mergeNested(current.search, patch.search),
    reasoning: mergeNested(current.reasoning, patch.reasoning),
    show: mergeNested(current.show, patch.show),
  };

  const nextValue = pruneNext(merged);
  return {
    ...ui,
    next: nextValue,
  };
};

export const deriveNextPatchFromLegacy = (
  partial: Partial<UIState>,
): Partial<UINextOverrides> => {
  const patch: Partial<UINextOverrides> = {};
  if ('nextModel' in partial) patch.model = partial.nextModel;
  if ('nextDeepResearch' in partial) patch.deepResearch = partial.nextDeepResearch;
  if ('nextTutorMode' in partial) patch.tutorMode = partial.nextTutorMode;
  if ('nextTutorNudge' in partial) patch.tutorNudge = partial.nextTutorNudge;
  if ('nextSystem' in partial) patch.system = partial.nextSystem;
  if ('nextTemperature' in partial) patch.temperature = partial.nextTemperature;
  if ('nextTopP' in partial) patch.topP = partial.nextTopP;
  if ('nextMaxTokens' in partial) patch.maxTokens = partial.nextMaxTokens;
  if ('nextParallelModels' in partial) patch.parallelModels = partial.nextParallelModels;
  if ('nextSearchEnabled' in partial || 'nextSearchProvider' in partial) {
    patch.search = {
      enabled: partial.nextSearchEnabled,
      provider: partial.nextSearchProvider,
    };
  }
  if ('nextReasoningEffort' in partial || 'nextReasoningTokens' in partial) {
    patch.reasoning = {
      effort: partial.nextReasoningEffort,
      tokens: partial.nextReasoningTokens,
    };
  }
  if (
    'nextShowThinking' in partial ||
    'nextShowStats' in partial ||
    'nextShowToolCallLog' in partial ||
    'nextShowDebugRawJson' in partial
  ) {
    patch.show = {
      thinking: partial.nextShowThinking,
      stats: partial.nextShowStats,
      toolCallLog: partial.nextShowToolCallLog,
      debugRawJson: partial.nextShowDebugRawJson,
    };
  }
  return patch;
};
