import type { Chat, ChatSettings, ModelDescriptor } from '@/lib/types';
import type { UiNextOverrides, UiSnapshot } from '@/lib/contracts/ui';
import type { ModelIndex, ModelCapabilityFlags } from '@/lib/models';
import type { GenerationSettings } from '@/lib/settings/generation';
import type { AccessTier } from '@/lib/auth/types';
import { providerSortFromRoutePref, selectSearchProvider } from '@/lib/policy/provider';
import { readNextOverrides } from '@/lib/ui/next';
import { DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';
import { DEFAULT_BASE_SYSTEM } from '@/lib/agent/policy';
import { applyTutorDefaults } from '@/lib/tutor/defaults';
import { normalizeParallelModels } from '@/lib/models/normalization';
import { isTutorRuntimeEnabled } from '@/lib/policy/runtime';

type SearchProvider = 'brave' | 'openrouter';

export type ResolvedTurnSettings = {
  modelId: string;
  modelMeta?: ModelDescriptor;
  caps: ModelCapabilityFlags;
  generation: GenerationSettings;
  tutorEnabled: boolean;
  system?: string;
  tutorNudge?: UiNextOverrides['tutorNudge'];
};

export function resolveNewChatSettings(opts: {
  ui: UiSnapshot;
  fallbackModelId: string;
  fallbackSystem?: string;
  lastUsedModelId?: string;
  previous?: ChatSettings;
  braveEnabled: boolean;
  tutorEnabled: boolean;
  forceTutorMode: boolean;
}): ChatSettings {
  const {
    ui,
    fallbackModelId,
    fallbackSystem = DEFAULT_BASE_SYSTEM,
    lastUsedModelId,
    previous,
    braveEnabled,
    tutorEnabled,
    forceTutorMode,
  } = opts;

  const next = readNextOverrides(ui);
  const baseModel = next.model ?? previous?.model ?? lastUsedModelId ?? fallbackModelId;
  const system = next.system ?? previous?.system ?? fallbackSystem;
  const temperature = next.temperature ?? previous?.temperature;
  const top_p = next.topP ?? previous?.top_p;
  const max_tokens = next.maxTokens ?? previous?.max_tokens;
  const reasoning_effort = next.reasoning?.effort ?? previous?.reasoning_effort ?? undefined;
  const reasoning_tokens = next.reasoning?.tokens ?? previous?.reasoning_tokens;
  const show_thinking_by_default =
    next.show?.thinking ?? previous?.show_thinking_by_default ?? false;
  const show_stats = next.show?.stats ?? previous?.show_stats ?? false;
  const showToolCallLog = next.show?.toolCallLog ?? previous?.showToolCallLog ?? false;
  const showDebugRawJson = next.show?.debugRawJson ?? previous?.showDebugRawJson ?? true;

  const search_enabled = next.search?.enabled ?? previous?.search_enabled ?? false;
  const nextProvider = next.search?.provider ?? previous?.search_provider;
  const search_provider = braveEnabled && nextProvider === 'brave' ? 'brave' : 'openrouter';

  const tutor_mode = forceTutorMode
    ? true
    : tutorEnabled
      ? (next.tutorMode ?? previous?.tutor_mode ?? false)
      : false;

  const parallelFromUi = Array.isArray(next.parallelModels)
    ? next.parallelModels
    : previous?.parallel_models;
  const normalizedParallel = normalizeParallelModels(baseModel, parallelFromUi);

  const settings: ChatSettings = {
    model: baseModel,
    parallel_models: normalizedParallel,
    system,
    temperature,
    top_p,
    max_tokens,
    reasoning_effort,
    reasoning_tokens,
    show_thinking_by_default,
    show_stats,
    showToolCallLog,
    showDebugRawJson,
    search_enabled,
    search_provider,
    tutor_mode,
  };

  if (tutor_mode) {
    const ensured = applyTutorDefaults({
      ui,
      chat: { settings },
      fallbackDefaultModelId: DEFAULT_TUTOR_MODEL_ID,
    });
    Object.assign(settings, ensured.nextSettings, {
      tutor_mode: true,
      parallel_models: [],
    });
  }

  return settings;
}

export function resolveTurnSettings(args: {
  chat: Chat;
  ui: UiSnapshot;
  modelIndex: ModelIndex;
  modelId?: string;
  tier?: AccessTier;
}): ResolvedTurnSettings {
  const { chat, ui, modelIndex, modelId, tier } = args;
  const overrides = readNextOverrides(ui);
  const resolvedModelId = modelId || overrides.model || chat.settings.model;
  const caps = modelIndex.caps(resolvedModelId);
  const modelMeta = modelIndex.get(resolvedModelId);
  const supportsReasoning = caps.canReason;

  const system = overrides.system ?? chat.settings.system;
  const temperature = overrides.temperature ?? chat.settings.temperature;
  const topP = overrides.topP ?? chat.settings.top_p;
  const maxTokens = overrides.maxTokens ?? chat.settings.max_tokens;
  const reasoningEffort = supportsReasoning
    ? (overrides.reasoning?.effort ?? chat.settings.reasoning_effort)
    : undefined;
  const reasoningTokens = supportsReasoning
    ? (overrides.reasoning?.tokens ?? chat.settings.reasoning_tokens)
    : undefined;
  const searchEnabled = overrides.search?.enabled ?? chat.settings.search_enabled;
  const searchProviderCandidate = overrides.search?.provider ?? chat.settings.search_provider;
  const providerSort = providerSortFromRoutePref(ui.routePreference);
  const searchProvider: SearchProvider = selectSearchProvider(
    { ...chat.settings, search_provider: searchProviderCandidate },
    ui,
  );

  const tutorModeSetting = overrides.tutorMode ?? chat.settings.tutor_mode;
  const policyChat =
    tutorModeSetting === chat.settings.tutor_mode
      ? chat
      : { ...chat, settings: { ...chat.settings, tutor_mode: tutorModeSetting } };
  const tutorEnabled = isTutorRuntimeEnabled(ui, policyChat, tier);

  const generation: GenerationSettings = {
    temperature,
    topP,
    maxTokens,
    reasoningEffort,
    reasoningTokens,
    searchEnabled,
    searchProvider,
    tutorMode: tutorEnabled,
    providerSort,
  };

  return {
    modelId: resolvedModelId,
    modelMeta,
    caps,
    generation,
    tutorEnabled,
    system,
    tutorNudge: overrides.tutorNudge,
  };
}
