import type {
  Chat,
  ChatDefaults,
  ChatSettings,
  GenerationSettings,
  ModelDescriptor,
  SearchProvider,
} from '@/lib/types';
import type { UiNextOverrides, UiSnapshot } from '@/lib/contracts/ui';
import type { ModelIndex, ModelCapabilityFlags } from '@/lib/models';
import { supportsXhighReasoningEffort } from '@/lib/models';
import type { AccessTier } from '@/lib/auth/types';
import { providerSortFromRoutePref, selectSearchProvider } from '@/lib/policy/provider';
import { readNextOverrides } from '@/lib/ui/next';
import { DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';
import { DEFAULT_BASE_SYSTEM } from '@/lib/agent/prompts/baseSystem';
import { normalizeParallelModels } from '@/lib/models/normalization';
import { isTutorRuntimeEnabled } from '@/lib/policy/runtime';
import { normalizeChatSettings } from '@/lib/settings/normalize';
import { isTavilySearchConfigured } from '@/lib/env/public';

export type ResolvedTurnSettings = {
  modelId: string;
  modelMeta?: ModelDescriptor;
  caps: ModelCapabilityFlags;
  generation: GenerationSettings;
  searchEnabled: boolean;
  searchProvider: SearchProvider;
  tutorEnabled: boolean;
  system?: string;
  tutorNudge?: UiNextOverrides['tutorNudge'];
};

export function resolveNewChatSettings(opts: {
  ui: UiSnapshot;
  fallbackModelId: string;
  fallbackSystem?: string;
  lastUsedModelId?: string;
  defaults?: ChatDefaults;
  tutorEnabled: boolean;
  forceTutorMode: boolean;
}): ChatSettings {
  const {
    ui,
    fallbackModelId,
    fallbackSystem = DEFAULT_BASE_SYSTEM,
    lastUsedModelId,
    defaults,
    tutorEnabled,
    forceTutorMode,
  } = opts;

  const next = readNextOverrides(ui);
  const defaultGeneration = defaults?.generation;
  const defaultUi = defaults?.ui;
  const defaultSearch = defaults?.features?.search;

  const baseModel = next.modelId ?? defaults?.modelId ?? lastUsedModelId ?? fallbackModelId;
  const system = next.system ?? defaults?.system ?? fallbackSystem;
  const temperature = next.temperature ?? defaultGeneration?.temperature;
  const topP = next.topP ?? defaultGeneration?.topP;
  const maxTokens = next.maxTokens ?? defaultGeneration?.maxTokens;
  const reasoningEffort = next.reasoning?.effort ?? defaultGeneration?.reasoningEffort ?? undefined;
  const reasoningTokens = next.reasoning?.tokens ?? defaultGeneration?.reasoningTokens;

  const uiSettings = {
    showThinkingByDefault: next.show?.thinking ?? defaultUi?.showThinkingByDefault ?? false,
    showStats: next.show?.stats ?? defaultUi?.showStats ?? false,
    showToolCallLog: next.show?.toolCallLog ?? defaultUi?.showToolCallLog ?? false,
    showDebugRawJson: next.show?.debugRawJson ?? defaultUi?.showDebugRawJson ?? true,
  };

  const searchEnabled = next.search?.enabled ?? defaultSearch?.enabled ?? false;
  const nextProvider = next.search?.provider ?? defaultSearch?.provider;
  const rawSearchProvider = nextProvider as unknown;
  const searchProvider =
    rawSearchProvider === 'tavily' || rawSearchProvider === 'brave'
      ? 'tavily'
      : rawSearchProvider === 'openrouter'
        ? 'openrouter'
        : isTavilySearchConfigured()
          ? 'tavily'
          : 'openrouter';

  const tutorEnabledSetting = forceTutorMode ? true : tutorEnabled ? !!next.tutorMode : false;

  const parallelFromUi = Array.isArray(next.parallelModels)
    ? next.parallelModels
    : defaults?.parallelModels;
  const normalizedParallel = normalizeParallelModels(baseModel, parallelFromUi);

  const settings: ChatSettings = {
    modelId: baseModel,
    parallelModels: normalizedParallel,
    system,
    generation: {
      temperature,
      topP,
      maxTokens,
      reasoningEffort,
      reasoningTokens,
      providerSort: defaultGeneration?.providerSort,
    },
    ui: uiSettings,
    features: {
      search: {
        enabled: searchEnabled,
        provider: searchProvider,
      },
      tutor: {
        enabled: tutorEnabledSetting,
      },
    },
  };

  return normalizeChatSettings(settings, {
    fallbackModelId,
    fallbackSystem,
    fallbackTutorModelId: DEFAULT_TUTOR_MODEL_ID,
    ui,
    applyTutorDefaults: true,
  });
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
  const resolvedModelId = modelId || overrides.modelId || chat.settings.modelId;
  const caps = modelIndex.caps(resolvedModelId);
  const modelMeta = modelIndex.get(resolvedModelId);
  const supportsReasoning = caps.canReason;

  const system = overrides.system ?? chat.settings.system;
  const temperature = overrides.temperature ?? chat.settings.generation.temperature;
  const topP = overrides.topP ?? chat.settings.generation.topP;
  const maxTokens = overrides.maxTokens ?? chat.settings.generation.maxTokens;
  const rawReasoningEffort = supportsReasoning
    ? (overrides.reasoning?.effort ?? chat.settings.generation.reasoningEffort)
    : undefined;
  // Only demote xhigh when we have positive evidence the model doesn't support it.
  // When modelMeta is undefined (model list not yet loaded, or unknown id) we preserve
  // the user's setting — the request layer sees the same metadata and will do the
  // right thing, and users on xhigh-capable models don't lose their selection while
  // the index is hydrating.
  const reasoningEffort =
    rawReasoningEffort === 'xhigh' && modelMeta && !supportsXhighReasoningEffort(modelMeta)
      ? 'high'
      : rawReasoningEffort;
  const reasoningTokens = supportsReasoning
    ? (overrides.reasoning?.tokens ?? chat.settings.generation.reasoningTokens)
    : undefined;
  const searchEnabled = overrides.search?.enabled ?? chat.settings.features.search.enabled;
  const searchProviderCandidate =
    overrides.search?.provider ?? chat.settings.features.search.provider;
  const providerSort = providerSortFromRoutePref(ui.routePreference);
  const searchProvider: SearchProvider = selectSearchProvider(
    {
      ...chat.settings,
      features: {
        ...chat.settings.features,
        search: {
          ...chat.settings.features.search,
          provider: searchProviderCandidate,
        },
      },
    },
    ui,
  );

  const tutorModeSetting = overrides.tutorMode ?? chat.settings.features.tutor.enabled;
  const policyChat =
    tutorModeSetting === chat.settings.features.tutor.enabled
      ? chat
      : {
          ...chat,
          settings: {
            ...chat.settings,
            features: {
              ...chat.settings.features,
              tutor: {
                ...chat.settings.features.tutor,
                enabled: tutorModeSetting,
              },
            },
          },
        };
  const tutorEnabled = isTutorRuntimeEnabled(ui, policyChat, tier);

  const generation: GenerationSettings = {
    temperature,
    topP,
    maxTokens,
    reasoningEffort,
    reasoningTokens,
    providerSort,
  };

  return {
    modelId: resolvedModelId,
    modelMeta,
    caps,
    generation,
    searchEnabled,
    searchProvider,
    tutorEnabled,
    system,
    tutorNudge: overrides.tutorNudge,
  };
}
