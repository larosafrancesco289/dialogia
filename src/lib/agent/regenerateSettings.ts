// Module: agent/regenerateSettings
// Responsibility: Reconcile a reply's saved generation snapshot with the chat's current settings.

import type { ChatSettings, GenSettingsSnapshot, Message, ReasoningEffort } from '@/lib/types';
import { ReasoningEffortEnum } from '@/lib/types';
import { ProviderSort } from '@/lib/models/providerSort';
import type { SearchMode } from '@/lib/agent/types';
import { TAVILY_PROVIDER_ID } from '@/lib/search/providers';

type RegenerationSettingsInput = {
  /** The reply being regenerated: its snapshot and the model that wrote it. */
  original: Pick<Message, 'genSettings' | 'model'>;
  settings: ChatSettings;
  /** The model the new attempt runs on. */
  modelId: string;
  supportsReasoning: boolean;
};

type RegenerationSettings = {
  /** The snapshot the new reply records. */
  genSettings: GenSettingsSnapshot;
  /** The chat's settings with the reconciled values applied, for this turn only. */
  chatSettings: ChatSettings;
  providerSort?: ProviderSort;
};

/**
 * Each field comes from the original reply's snapshot, falling back to the
 * chat. When the new attempt runs on a different model the chat wins instead,
 * and reasoning values never carry over from the old model's snapshot: an
 * effort it resolved for itself need not suit the new one, whose own default
 * applies downstream.
 */
export function resolveRegenerationSettings({
  original,
  settings,
  modelId,
  supportsReasoning,
}: RegenerationSettingsInput): RegenerationSettings {
  const snapshot: GenSettingsSnapshot = original.genSettings ?? {};
  const previousModelId = typeof original.model === 'string' ? original.model : undefined;
  const modelChanged = typeof modelId === 'string' && modelId !== previousModelId;

  const pick = <T>(fromSnapshot: T | undefined, fromChat: T | undefined): T | undefined =>
    modelChanged ? (fromChat ?? fromSnapshot) : (fromSnapshot ?? fromChat);
  const pickReasoning = <T>(
    fromSnapshot: T | undefined,
    fromChat: T | undefined,
  ): T | undefined => {
    if (!supportsReasoning) return undefined;
    return modelChanged ? fromChat : (fromSnapshot ?? fromChat);
  };
  const asNumber = (value: unknown) => (typeof value === 'number' ? value : undefined);
  const asBoolean = (value: unknown) => (typeof value === 'boolean' ? value : undefined);
  const asEffort = (value: unknown) => (isReasoningEffort(value) ? value : undefined);

  const { generation, features } = settings;
  const temperature = pick(asNumber(snapshot.temperature), asNumber(generation.temperature));
  const topP = pick(asNumber(snapshot.topP), asNumber(generation.topP));
  const maxTokens = pick(asNumber(snapshot.maxTokens), asNumber(generation.maxTokens));
  const reasoningEffort = pickReasoning(
    asEffort(snapshot.reasoningEffort),
    asEffort(generation.reasoningEffort),
  );
  const reasoningTokens = pickReasoning(
    asNumber(snapshot.reasoningTokens),
    asNumber(generation.reasoningTokens),
  );
  const searchEnabled =
    pick(asBoolean(snapshot.searchEnabled), asBoolean(features.search.enabled)) ?? false;
  const searchProvider = pick(
    normalizeSearchProvider(snapshot.searchProvider),
    normalizeSearchProvider(features.search.provider),
  );
  const tutorEnabled =
    pick(asBoolean(snapshot.tutorEnabled), asBoolean(features.tutor?.enabled)) ?? false;
  const providerSort =
    snapshot.providerSort === ProviderSort.Price ||
    snapshot.providerSort === ProviderSort.Throughput
      ? snapshot.providerSort
      : undefined;

  const reconciled = {
    ...(temperature !== undefined ? { temperature } : {}),
    ...(topP !== undefined ? { topP } : {}),
    ...(maxTokens !== undefined ? { maxTokens } : {}),
    ...(reasoningEffort !== undefined ? { reasoningEffort } : {}),
    ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
  };

  const genSettings: GenSettingsSnapshot = {
    ...reconciled,
    searchEnabled,
    ...(searchProvider ? { searchProvider } : {}),
    tutorEnabled,
    ...(providerSort ? { providerSort } : {}),
  };

  const chatSettings: ChatSettings = {
    ...settings,
    modelId,
    generation: { ...generation, ...reconciled },
    features: {
      ...features,
      search: {
        ...features.search,
        enabled: searchEnabled,
        ...(searchProvider ? { provider: searchProvider } : {}),
      },
      tutor: { ...features.tutor, enabled: tutorEnabled },
    },
  };

  return { genSettings, chatSettings, providerSort };
}

const isReasoningEffort = (value: unknown): value is ReasoningEffort =>
  Object.values(ReasoningEffortEnum).includes(value as ReasoningEffort);

/**
 * `SearchMode` is open by design, so any registered provider id is valid here.
 * An id this machine has no key for is not rejected: `selectSearchMode` further
 * down degrades it to provider-native search.
 */
const normalizeSearchProvider = (value: unknown): SearchMode | undefined => {
  if (typeof value !== 'string' || !value) return undefined;
  // 'brave' is a retired provider id that still sits in old persisted chats.
  return value === 'brave' ? TAVILY_PROVIDER_ID : value;
};
