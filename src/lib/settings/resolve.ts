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
import {
  clampReasoningEffort,
  getDefaultReasoningEffort,
  resolveDynamicModelId,
} from '@/lib/models';
import { selectSearchProvider } from '@/lib/policy/provider';
import { readNextOverrides } from '@/lib/ui/next';
import { DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';
import { DEFAULT_BASE_SYSTEM } from '@/lib/agent/prompts/baseSystem';
import { isTutorRuntimeEnabled } from '@/lib/policy/runtime';
import { normalizeChatSettings } from '@/lib/settings/normalize';
import { DEFAULT_REASONING_EFFORT } from '@/lib/settings/generation';

export type ResolvedTurnSettings = {
  modelId: string;
  modelMeta?: ModelDescriptor;
  caps: ModelCapabilityFlags;
  generation: GenerationSettings;
  searchEnabled: boolean;
  searchProvider: SearchProvider;
  tutorEnabled: boolean;
  timestampsEnabled: boolean;
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
        : 'tavily';

  const tutorEnabledSetting = forceTutorMode ? true : tutorEnabled ? !!next.tutorMode : false;

  const settings: ChatSettings = {
    modelId: baseModel,
    system,
    generation: {
      maxTokens,
      reasoningEffort,
      reasoningTokens,
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
}): ResolvedTurnSettings {
  const { chat, ui, modelIndex, modelId } = args;
  const overrides = readNextOverrides(ui);
  // Safety net: dynamic default aliases must never reach the request layer.
  const resolvedModelId = resolveDynamicModelId(
    modelId || overrides.modelId || chat.settings.modelId,
    modelIndex.all,
  );
  const caps = modelIndex.caps(resolvedModelId);
  const modelMeta = modelIndex.get(resolvedModelId);
  const supportsReasoning = caps.canReason;

  const system = overrides.system ?? chat.settings.system;
  const maxTokens = overrides.maxTokens ?? chat.settings.generation.maxTokens;
  const explicitReasoningTokens = supportsReasoning
    ? (overrides.reasoning?.tokens ?? chat.settings.generation.reasoningTokens)
    : undefined;
  // When the user hasn't chosen an effort (and set no token budget), follow
  // the model's own provider default (e.g. Claude reasoning models default to
  // 'high'); fall back to the app standard when the metadata carries none.
  const rawReasoningEffort = supportsReasoning
    ? (overrides.reasoning?.effort ??
      chat.settings.generation.reasoningEffort ??
      (explicitReasoningTokens === undefined
        ? (getDefaultReasoningEffort(modelMeta) ?? DEFAULT_REASONING_EFFORT)
        : undefined))
    : undefined;
  // Clamp to the effort levels the provider reports for this model. When
  // modelMeta is undefined (model list not yet loaded, or unknown id) the
  // value passes through unchanged — the request layer sees the same metadata
  // and will do the right thing, and users don't lose their selection while
  // the index is hydrating.
  const reasoningEffort = rawReasoningEffort
    ? clampReasoningEffort(rawReasoningEffort, modelMeta)
    : rawReasoningEffort;
  const reasoningTokens = explicitReasoningTokens;
  const searchEnabled = overrides.search?.enabled ?? chat.settings.features.search.enabled;
  const searchProviderCandidate =
    overrides.search?.provider ?? chat.settings.features.search.provider;
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

  const tutorModeSetting = overrides.tutorMode ?? chat.settings.features.tutor?.enabled;
  const policyChat =
    tutorModeSetting === chat.settings.features.tutor?.enabled
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
  const tutorEnabled = isTutorRuntimeEnabled(ui, policyChat);

  const generation: GenerationSettings = {
    maxTokens,
    reasoningEffort,
    reasoningTokens,
  };

  return {
    modelId: resolvedModelId,
    modelMeta,
    caps,
    generation,
    searchEnabled,
    searchProvider,
    tutorEnabled,
    timestampsEnabled: ui.messageTimestamps === true,
    system,
    tutorNudge: overrides.tutorNudge,
  };
}
