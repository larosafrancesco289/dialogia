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
  return {
    ...base,
    model: base.model ?? ui.nextModel,
    search: {
      enabled: base.search?.enabled ?? ui.nextSearchEnabled,
      provider: base.search?.provider ?? ui.nextSearchProvider,
    },
    deepResearch: base.deepResearch ?? ui.nextDeepResearch,
    tutorMode: base.tutorMode ?? ui.nextTutorMode,
    tutorNudge: base.tutorNudge ?? ui.nextTutorNudge,
    reasoning: {
      effort: base.reasoning?.effort ?? ui.nextReasoningEffort,
      tokens: base.reasoning?.tokens ?? ui.nextReasoningTokens,
    },
    system: base.system ?? ui.nextSystem,
    temperature: base.temperature ?? ui.nextTemperature,
    topP: base.topP ?? ui.nextTopP,
    maxTokens: base.maxTokens ?? ui.nextMaxTokens,
    show: {
      thinking: base.show?.thinking ?? ui.nextShowThinking,
      stats: base.show?.stats ?? ui.nextShowStats,
      toolCallLog: base.show?.toolCallLog ?? ui.nextShowToolCallLog,
      debugRawJson: base.show?.debugRawJson ?? ui.nextShowDebugRawJson,
    },
    parallelModels: base.parallelModels ?? ui.nextParallelModels,
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
    nextModel: merged.model,
    nextSearchEnabled: merged.search?.enabled,
    nextSearchProvider: merged.search?.provider,
    nextDeepResearch: merged.deepResearch,
    nextTutorMode: merged.tutorMode,
    nextTutorNudge: merged.tutorNudge,
    nextReasoningEffort: merged.reasoning?.effort,
    nextReasoningTokens: merged.reasoning?.tokens,
    nextSystem: merged.system,
    nextTemperature: merged.temperature,
    nextTopP: merged.topP,
    nextMaxTokens: merged.maxTokens,
    nextShowThinking: merged.show?.thinking,
    nextShowStats: merged.show?.stats,
    nextShowToolCallLog: merged.show?.toolCallLog,
    nextShowDebugRawJson: merged.show?.debugRawJson,
    nextParallelModels: merged.parallelModels,
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
