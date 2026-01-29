import type {
  Chat,
  ChatSettings,
  GenerationSettings,
  ModelDescriptor,
  SearchProvider,
} from '@/lib/types';
import type { UiNextOverrides, UiSnapshot } from '@/lib/contracts/ui';
import type { ModelIndex, ModelCapabilityFlags } from '@/lib/models';
import type { AccessTier } from '@/lib/auth/types';
import { providerSortFromRoutePref, selectSearchProvider } from '@/lib/policy/provider';
import { readNextOverrides } from '@/lib/ui/next';
import { DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';
import { DEFAULT_BASE_SYSTEM } from '@/lib/agent/policy';
import { applyTutorDefaults } from '@/lib/tutor/defaults';
import { normalizeParallelModels } from '@/lib/models/normalization';
import { isTutorRuntimeEnabled } from '@/lib/policy/runtime';

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
  const previousGeneration = previous?.generation;
  const previousUi = previous?.ui;
  const previousFeatures = previous?.features;
  const previousSearch = previousFeatures?.search;
  const previousTutor = previousFeatures?.tutor;

  const baseModel = next.modelId ?? previous?.modelId ?? lastUsedModelId ?? fallbackModelId;
  const system = next.system ?? previous?.system ?? fallbackSystem;
  const temperature = next.temperature ?? previousGeneration?.temperature;
  const topP = next.topP ?? previousGeneration?.topP;
  const maxTokens = next.maxTokens ?? previousGeneration?.maxTokens;
  const reasoningEffort =
    next.reasoning?.effort ?? previousGeneration?.reasoningEffort ?? undefined;
  const reasoningTokens = next.reasoning?.tokens ?? previousGeneration?.reasoningTokens;

  const uiSettings = {
    showThinkingByDefault: next.show?.thinking ?? previousUi?.showThinkingByDefault ?? false,
    showStats: next.show?.stats ?? previousUi?.showStats ?? false,
    showToolCallLog: next.show?.toolCallLog ?? previousUi?.showToolCallLog ?? false,
    showDebugRawJson: next.show?.debugRawJson ?? previousUi?.showDebugRawJson ?? true,
  };

  const searchEnabled = next.search?.enabled ?? previousSearch?.enabled ?? false;
  const nextProvider = next.search?.provider ?? previousSearch?.provider;
  const searchProvider = braveEnabled && nextProvider === 'brave' ? 'brave' : 'openrouter';

  const tutorEnabledSetting = forceTutorMode
    ? true
    : tutorEnabled
      ? (next.tutorMode ?? previousTutor?.enabled ?? false)
      : false;

  const parallelFromUi = Array.isArray(next.parallelModels)
    ? next.parallelModels
    : previous?.parallelModels;
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
      providerSort: previousGeneration?.providerSort,
    },
    ui: uiSettings,
    features: {
      search: {
        enabled: searchEnabled,
        provider: searchProvider,
      },
      tutor: {
        enabled: tutorEnabledSetting,
        defaultModelId: previousTutor?.defaultModelId,
        thesisMode: previousTutor?.thesisMode,
        researchMode: previousTutor?.researchMode,
        toolBudget: previousTutor?.toolBudget,
        learningPlan: previousTutor?.learningPlan,
        planGenerated: previousTutor?.planGenerated,
        planGenerationModel: previousTutor?.planGenerationModel,
        disablePlanGeneration: previousTutor?.disablePlanGeneration,
        enableLearnerModel: previousTutor?.enableLearnerModel,
        learnerModelVisible: previousTutor?.learnerModelVisible,
        learnerModel: previousTutor?.learnerModel,
      },
    },
  };

  if (settings.features.tutor.enabled) {
    const ensured = applyTutorDefaults({
      ui,
      chat: { settings },
      fallbackDefaultModelId: DEFAULT_TUTOR_MODEL_ID,
    });
    Object.assign(settings, ensured.nextSettings, {
      features: {
        ...settings.features,
        tutor: {
          ...settings.features.tutor,
          enabled: true,
        },
      },
      parallelModels: [],
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
  const resolvedModelId = modelId || overrides.modelId || chat.settings.modelId;
  const caps = modelIndex.caps(resolvedModelId);
  const modelMeta = modelIndex.get(resolvedModelId);
  const supportsReasoning = caps.canReason;

  const system = overrides.system ?? chat.settings.system;
  const temperature = overrides.temperature ?? chat.settings.generation.temperature;
  const topP = overrides.topP ?? chat.settings.generation.topP;
  const maxTokens = overrides.maxTokens ?? chat.settings.generation.maxTokens;
  const reasoningEffort = supportsReasoning
    ? (overrides.reasoning?.effort ?? chat.settings.generation.reasoningEffort)
    : undefined;
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
