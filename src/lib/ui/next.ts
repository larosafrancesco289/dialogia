import type { UIState, UINextOverrides } from '@/lib/store/types';

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
  const legacy = partial as Record<string, unknown>;
  if (typeof legacy.nextModel === 'string') patch.model = legacy.nextModel as string;
  if (typeof legacy.nextDeepResearch === 'boolean')
    patch.deepResearch = legacy.nextDeepResearch as boolean;
  if (typeof legacy.nextTutorMode === 'boolean') patch.tutorMode = legacy.nextTutorMode as boolean;
  if (typeof legacy.nextTutorNudge === 'string') {
    const nudge = legacy.nextTutorNudge as string;
    const allowed = ['more_practice', 'harder', 'easier', 'review_mistakes', 'new_concept'];
    if (allowed.includes(nudge)) patch.tutorNudge = nudge as UINextOverrides['tutorNudge'];
  }
  if (typeof legacy.nextSystem === 'string') patch.system = legacy.nextSystem as string;
  if (typeof legacy.nextTemperature === 'number')
    patch.temperature = legacy.nextTemperature as number;
  if (typeof legacy.nextTopP === 'number') patch.topP = legacy.nextTopP as number;
  if (typeof legacy.nextMaxTokens === 'number') patch.maxTokens = legacy.nextMaxTokens as number;
  if (Array.isArray(legacy.nextParallelModels))
    patch.parallelModels = legacy.nextParallelModels as string[];
  if ('nextSearchEnabled' in legacy || 'nextSearchProvider' in legacy) {
    patch.search = {
      enabled:
        typeof legacy.nextSearchEnabled === 'boolean' ? (legacy.nextSearchEnabled as boolean) : undefined,
      provider: typeof legacy.nextSearchProvider === 'string' ? (legacy.nextSearchProvider as any) : undefined,
    };
  }
  if ('nextReasoningEffort' in legacy || 'nextReasoningTokens' in legacy) {
    patch.reasoning = {
      effort:
        typeof legacy.nextReasoningEffort === 'string'
          ? (legacy.nextReasoningEffort as UINextOverrides['reasoning'] extends { effort?: infer E }
              ? E
              : never)
          : undefined,
      tokens: typeof legacy.nextReasoningTokens === 'number' ? (legacy.nextReasoningTokens as number) : undefined,
    };
  }
  if (
    'nextShowThinking' in legacy ||
    'nextShowStats' in legacy ||
    'nextShowToolCallLog' in legacy ||
    'nextShowDebugRawJson' in legacy
  ) {
    patch.show = {
      thinking: typeof legacy.nextShowThinking === 'boolean' ? (legacy.nextShowThinking as boolean) : undefined,
      stats: typeof legacy.nextShowStats === 'boolean' ? (legacy.nextShowStats as boolean) : undefined,
      toolCallLog:
        typeof legacy.nextShowToolCallLog === 'boolean'
          ? (legacy.nextShowToolCallLog as boolean)
          : undefined,
      debugRawJson:
        typeof legacy.nextShowDebugRawJson === 'boolean'
          ? (legacy.nextShowDebugRawJson as boolean)
          : undefined,
    };
  }
  return patch;
};
