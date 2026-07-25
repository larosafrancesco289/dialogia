import type { ReasoningEffort, SearchProvider } from '@/lib/types/enums';
import { asNumber, asStringArray, isRecord } from '@/lib/utils/guards';
import { ReasoningEffortEnum, SearchProviderEnum } from '@/lib/types/enums';

type UnknownRecord = Record<string, unknown>;

export type MigrationResult<T> = { next: T; changed: boolean };

const readBoolean = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const readRecord = (value: unknown): UnknownRecord | undefined =>
  isRecord(value) ? value : undefined;

const readSearchProvider = (value: unknown): SearchProvider | undefined =>
  value === 'brave'
    ? 'tavily'
    : Object.values(SearchProviderEnum).includes(value as SearchProvider)
      ? (value as SearchProvider)
      : undefined;

const readReasoningEffort = (value: unknown): ReasoningEffort | undefined =>
  Object.values(ReasoningEffortEnum).includes(value as ReasoningEffort)
    ? (value as ReasoningEffort)
    : undefined;

const compactRecord = <T extends UnknownRecord>(input: T): T | undefined => {
  const entries = Object.entries(input).filter(([, value]) => value !== undefined);
  return entries.length ? (Object.fromEntries(entries) as T) : undefined;
};

export function migrateGenSettingsRecord(input: unknown): MigrationResult<unknown> {
  if (!isRecord(input)) return { next: input, changed: false };
  const record = input as UnknownRecord;
  const reasoning = readRecord(record.reasoning);

  const temperature = asNumber(record.temperature);
  const topP = asNumber(record.topP) ?? asNumber(record.top_p);
  const maxTokens = asNumber(record.maxTokens) ?? asNumber(record.max_tokens);
  const reasoningEffort =
    readReasoningEffort(record.reasoningEffort) ??
    readReasoningEffort(record.reasoning_effort) ??
    readReasoningEffort(reasoning?.effort);
  const reasoningTokens =
    asNumber(record.reasoningTokens) ??
    asNumber(record.reasoning_tokens) ??
    asNumber(reasoning?.max_tokens);
  const providerSort = readString(record.providerSort) ?? readString(record.provider_sort);

  const legacySearchWithBrave = readBoolean(record.search_with_brave);
  const searchEnabled =
    readBoolean(record.searchEnabled) ??
    readBoolean(record.search_enabled) ??
    (legacySearchWithBrave ? true : undefined);
  const searchProvider =
    readSearchProvider(record.searchProvider) ??
    readSearchProvider(record.search_provider) ??
    (legacySearchWithBrave ? 'tavily' : undefined);
  const tutorEnabled =
    readBoolean(record.tutorEnabled) ??
    readBoolean(record.tutor_mode) ??
    readBoolean(record.tutor_enabled);

  const next =
    compactRecord({
      temperature,
      topP,
      maxTokens,
      reasoningEffort,
      reasoningTokens,
      providerSort,
      searchEnabled,
      searchProvider: searchProvider ?? (searchEnabled ? 'tavily' : undefined),
      tutorEnabled,
    }) ?? {};

  const changed = JSON.stringify(record) !== JSON.stringify(next);
  return { next, changed };
}

export function migrateChatSettingsRecord(input: unknown): MigrationResult<unknown> {
  if (!isRecord(input)) return { next: input, changed: false };
  const settings = input as UnknownRecord;

  const generation = readRecord(settings.generation);
  const generationReasoning = readRecord(generation?.reasoning);
  const ui = readRecord(settings.ui);
  const features = readRecord(settings.features);
  const search = readRecord(features?.search);
  const tutor = readRecord(features?.tutor);

  const modelId =
    readString(settings.modelId) ?? readString(settings.model) ?? readString(settings.model_id);
  const system = readString(settings.system);
  const parallelModels =
    asStringArray(settings.parallelModels) ?? asStringArray(settings.parallel_models);

  const temperature = asNumber(generation?.temperature) ?? asNumber(settings.temperature);
  const topP =
    asNumber(generation?.topP) ??
    asNumber(generation?.top_p) ??
    asNumber(settings.topP) ??
    asNumber(settings.top_p);
  const maxTokens =
    asNumber(generation?.maxTokens) ??
    asNumber(generation?.max_tokens) ??
    asNumber(settings.maxTokens) ??
    asNumber(settings.max_tokens);
  const reasoningEffort =
    readReasoningEffort(generation?.reasoningEffort) ??
    readReasoningEffort(generation?.reasoning_effort) ??
    readReasoningEffort(settings.reasoningEffort) ??
    readReasoningEffort(settings.reasoning_effort) ??
    readReasoningEffort(generationReasoning?.effort);
  const reasoningTokens =
    asNumber(generation?.reasoningTokens) ??
    asNumber(generation?.reasoning_tokens) ??
    asNumber(settings.reasoningTokens) ??
    asNumber(settings.reasoning_tokens) ??
    asNumber(generationReasoning?.max_tokens);
  const providerSort =
    readString(generation?.providerSort) ??
    readString(generation?.provider_sort) ??
    readString(settings.providerSort) ??
    readString(settings.provider_sort);

  const nextGeneration =
    compactRecord({
      temperature,
      topP,
      maxTokens,
      reasoningEffort,
      reasoningTokens,
      providerSort,
    }) ?? {};

  const legacySearchWithBrave = readBoolean(settings.search_with_brave);
  const searchEnabled =
    readBoolean(search?.enabled) ??
    readBoolean(settings.searchEnabled) ??
    readBoolean(settings.search_enabled) ??
    (legacySearchWithBrave ? true : undefined) ??
    false;
  const searchProvider =
    readSearchProvider(search?.provider) ??
    readSearchProvider(settings.searchProvider) ??
    readSearchProvider(settings.search_provider) ??
    (legacySearchWithBrave ? 'tavily' : undefined) ??
    'tavily';

  const tutorEnabled =
    readBoolean(tutor?.enabled) ??
    readBoolean(settings.tutorEnabled) ??
    readBoolean(settings.tutor_mode) ??
    false;

  const nextTutor = compactRecord({
    enabled: tutorEnabled,
    defaultModelId:
      readString(tutor?.defaultModelId) ??
      readString(settings.tutorDefaultModelId) ??
      readString(settings.tutorDefaultModel) ??
      readString(settings.tutor_default_model),
    toolBudget:
      readRecord(tutor?.toolBudget) ??
      readRecord(settings.tutorToolBudget) ??
      readRecord(settings.tutor_tool_budget),
    learningPlan:
      readRecord(tutor?.learningPlan) ??
      readRecord(settings.learningPlan) ??
      readRecord(settings.tutorPlan) ??
      readRecord(settings.tutor_plan),
    planGenerated:
      readBoolean(tutor?.planGenerated) ??
      readBoolean(settings.planGenerated) ??
      readBoolean(settings.plan_generated),
    planGenerationModel:
      readString(tutor?.planGenerationModel) ??
      readString(settings.planGenerationModel) ??
      readString(settings.plan_generation_model),
    disablePlanGeneration:
      readBoolean(tutor?.disablePlanGeneration) ??
      readBoolean(settings.disablePlanGeneration) ??
      readBoolean(settings.disable_plan_generation),
    enableLearnerModel:
      readBoolean(tutor?.enableLearnerModel) ??
      readBoolean(settings.enableLearnerModel) ??
      readBoolean(settings.enable_learner_model),
    learnerModelVisible:
      readBoolean(tutor?.learnerModelVisible) ??
      readBoolean(settings.learnerModelVisible) ??
      readBoolean(settings.learner_model_visible),
    learnerModel:
      readRecord(tutor?.learnerModel) ??
      readRecord(settings.learnerModel) ??
      readRecord(settings.learner_model),
  }) ?? { enabled: tutorEnabled };

  const nextUi = {
    showThinkingByDefault:
      readBoolean(ui?.showThinkingByDefault) ??
      readBoolean(settings.showThinkingByDefault) ??
      readBoolean(settings.show_thinking_by_default) ??
      false,
    showStats:
      readBoolean(ui?.showStats) ??
      readBoolean(settings.showStats) ??
      readBoolean(settings.show_stats) ??
      false,
    showToolCallLog:
      readBoolean(ui?.showToolCallLog) ??
      readBoolean(settings.showToolCallLog) ??
      readBoolean(settings.show_tool_call_log) ??
      false,
    showDebugRawJson:
      readBoolean(ui?.showDebugRawJson) ??
      readBoolean(settings.showDebugRawJson) ??
      readBoolean(settings.show_debug_raw_json) ??
      true,
  };

  const next: UnknownRecord = {
    generation: nextGeneration,
    ui: nextUi,
    features: {
      search: { enabled: searchEnabled, provider: searchProvider },
      tutor: nextTutor,
    },
  };

  if (modelId !== undefined) next.modelId = modelId;
  if (system !== undefined) next.system = system;
  if (parallelModels !== undefined) next.parallelModels = parallelModels;

  const changed = JSON.stringify(settings) !== JSON.stringify(next);
  return { next, changed };
}
