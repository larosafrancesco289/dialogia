// Module: agent/regenerate
// Responsibility: Support regeneration of assistant messages with preserved settings.

import { buildChatCompletionMessages } from '@/lib/agent/prompt-builder';
import { composePlugins } from '@/lib/agent/request';
import type { Chat, GenSettingsSnapshot, ReasoningEffort } from '@/lib/types';
import { ReasoningEffortEnum } from '@/lib/types';
import { ProviderSort } from '@/lib/models/providerSort';
import type { ModelMessage, RegenerateOptions, SearchMode } from '@/lib/agent/types';
import { TAVILY_PROVIDER_ID } from '@/lib/search/providers';
import { streamFinal } from '@/lib/agent/streaming';
import { setTurnController } from '@/lib/turns/runtime';
import { createAssistantMessage } from '@/lib/messages/createMessage';
import { resolveTurnSettings } from '@/lib/settings/resolve';
import { adjustActiveTurnCount } from '@/lib/ui/streaming';

export async function regenerate(opts: RegenerateOptions): Promise<void> {
  const { chat, chatId, targetMessageId, messages, turn, controller, overrideModelId, pipeline } =
    opts;
  const { models, modelIndex, set } = turn;

  const index = messages.findIndex((msg) => msg.id === targetMessageId);
  if (index < 0) return;

  const original = messages[index];
  const priorMessages = messages.slice(0, index);
  const payload = buildChatCompletionMessages({
    chat,
    priorMessages,
    models,
    timestamps: turn.get().ui.messageTimestamps === true,
  });
  const systemSnapshot = original.systemSnapshot;
  const convo: ModelMessage[] = systemSnapshot
    ? [
        { role: 'system', content: systemSnapshot },
        ...payload.filter((entry) => entry.role !== 'system'),
      ]
    : payload;

  const hadPdfEarlier = priorMessages.some(
    (msg) => Array.isArray(msg.attachments) && msg.attachments.some((att) => att.kind === 'pdf'),
  );

  const modelIdForTurn = overrideModelId || chat.settings.modelId;
  const caps = modelIndex.caps(modelIdForTurn);
  const supportsReasoning = caps.canReason;

  const snapshotSettings: GenSettingsSnapshot = original.genSettings
    ? { ...original.genSettings }
    : {};
  const previousModelId = typeof original.model === 'string' ? original.model : undefined;
  const modelChanged = typeof modelIdForTurn === 'string' && modelIdForTurn !== previousModelId;

  const pickNumber = (snapshotVal: unknown, chatVal: unknown): number | undefined => {
    const fromSnapshot = typeof snapshotVal === 'number' ? snapshotVal : undefined;
    const fromChat = typeof chatVal === 'number' ? chatVal : undefined;
    if (modelChanged) return fromChat ?? fromSnapshot;
    return fromSnapshot ?? fromChat;
  };

  const pickReasoningEffort = (
    snapshotVal: unknown,
    chatVal: unknown,
  ): NonNullable<Chat['settings']['generation']['reasoningEffort']> | undefined => {
    if (!supportsReasoning) return undefined;
    const fromSnapshot = isReasoningEffort(snapshotVal) ? snapshotVal : undefined;
    const fromChat = isReasoningEffort(chatVal) ? chatVal : undefined;
    // Regenerating on a different model must not inherit the previous
    // model's (possibly auto-resolved) effort snapshot; without an explicit
    // chat setting the new model's own default applies downstream.
    if (modelChanged) return fromChat;
    return fromSnapshot ?? fromChat;
  };

  const pickReasoningTokens = (snapshotVal: unknown, chatVal: unknown): number | undefined => {
    if (!supportsReasoning) return undefined;
    const fromSnapshot = typeof snapshotVal === 'number' ? snapshotVal : undefined;
    const fromChat = typeof chatVal === 'number' ? chatVal : undefined;
    if (modelChanged) return fromChat;
    return fromSnapshot ?? fromChat;
  };

  const pickBoolean = (snapshotVal: unknown, chatVal: unknown, fallback = false): boolean => {
    const fromSnapshot = typeof snapshotVal === 'boolean' ? snapshotVal : undefined;
    const fromChat = typeof chatVal === 'boolean' ? chatVal : undefined;
    if (modelChanged) return fromChat ?? fromSnapshot ?? fallback;
    return fromSnapshot ?? fromChat ?? fallback;
  };

  const pickProvider = (snapshotVal: unknown, chatVal: unknown): SearchMode | undefined => {
    const fromSnapshot = normalizeSearchProvider(snapshotVal);
    const fromChat = normalizeSearchProvider(chatVal);
    if (modelChanged) return fromChat ?? fromSnapshot;
    return fromSnapshot ?? fromChat;
  };

  const temperature = pickNumber(
    snapshotSettings.temperature,
    chat.settings.generation.temperature,
  );
  const topP = pickNumber(snapshotSettings.topP, chat.settings.generation.topP);
  const maxTokens = pickNumber(snapshotSettings.maxTokens, chat.settings.generation.maxTokens);
  const reasoningEffort = pickReasoningEffort(
    snapshotSettings.reasoningEffort,
    chat.settings.generation.reasoningEffort,
  );
  const reasoningTokens = pickReasoningTokens(
    snapshotSettings.reasoningTokens,
    chat.settings.generation.reasoningTokens,
  );
  const searchEnabled = pickBoolean(
    snapshotSettings.searchEnabled,
    chat.settings.features.search.enabled,
    false,
  );
  const searchProvider = pickProvider(
    snapshotSettings.searchProvider,
    chat.settings.features.search.provider,
  );
  const tutorModeForTurn = pickBoolean(
    snapshotSettings.tutorEnabled,
    chat.settings.features.tutor?.enabled,
    false,
  );
  const providerSortSnapshot = (snapshotSettings as Record<string, unknown>).providerSort;
  const providerSort: ProviderSort | undefined =
    providerSortSnapshot === ProviderSort.Price || providerSortSnapshot === ProviderSort.Throughput
      ? (providerSortSnapshot as ProviderSort)
      : undefined;

  const appliedGenSettings: GenSettingsSnapshot = {};
  if (typeof temperature === 'number') appliedGenSettings.temperature = temperature;
  if (typeof topP === 'number') appliedGenSettings.topP = topP;
  if (typeof maxTokens === 'number') appliedGenSettings.maxTokens = maxTokens;
  if (supportsReasoning && typeof reasoningEffort === 'string')
    appliedGenSettings.reasoningEffort = reasoningEffort;
  if (supportsReasoning && typeof reasoningTokens === 'number')
    appliedGenSettings.reasoningTokens = reasoningTokens;
  appliedGenSettings.searchEnabled = !!searchEnabled;
  if (searchProvider) appliedGenSettings.searchProvider = searchProvider;
  appliedGenSettings.tutorEnabled = !!tutorModeForTurn;
  if (providerSort) appliedGenSettings.providerSort = providerSort;

  const replacement = createAssistantMessage({
    id: original.id,
    chatId,
    content: '',
    createdAt: original.createdAt,
    model: modelIdForTurn,
    attachments: [],
    systemSnapshot,
    genSettings: appliedGenSettings,
  });

  set((state) => ({
    messagesById: {
      ...state.messagesById,
      [original.id]: replacement,
    },
    ui: adjustActiveTurnCount(state.ui, chatId, 1),
  }));
  setTurnController(chatId, controller);

  const nextSettings: Chat['settings'] = {
    ...chat.settings,
    modelId: modelIdForTurn,
    generation: { ...chat.settings.generation },
    features: {
      ...chat.settings.features,
      search: { ...chat.settings.features.search },
      tutor: { ...chat.settings.features.tutor },
    },
  };
  if (typeof temperature === 'number') nextSettings.generation.temperature = temperature;
  if (typeof topP === 'number') nextSettings.generation.topP = topP;
  if (typeof maxTokens === 'number') nextSettings.generation.maxTokens = maxTokens;
  if (supportsReasoning && typeof reasoningEffort === 'string')
    nextSettings.generation.reasoningEffort = reasoningEffort;
  if (supportsReasoning && typeof reasoningTokens === 'number')
    nextSettings.generation.reasoningTokens = reasoningTokens;
  nextSettings.features.search.enabled = !!searchEnabled;
  if (searchProvider) nextSettings.features.search.provider = searchProvider;
  nextSettings.features.tutor = { ...nextSettings.features.tutor, enabled: !!tutorModeForTurn };

  const chatForStream: Chat = { ...chat, settings: nextSettings };

  const uiSnapshot = turn.get().ui;
  const settings = resolveTurnSettings({
    chat: chatForStream,
    ui: { ...uiSnapshot, overrides: undefined },
    modelIndex,
    modelId: modelIdForTurn,
  });
  settings.generation.providerSort = providerSort;

  // Built after `resolveTurnSettings`, never before: that is where a tool-based
  // search provider with no key on this machine degrades to provider-native
  // search, and native search is exactly what needs the `web` plugin.
  const plugins = composePlugins({
    hasPdf: hadPdfEarlier,
    searchEnabled: settings.searchEnabled,
    searchProvider: settings.searchProvider,
  });

  try {
    await streamFinal({
      chat: chatForStream,
      chatId,
      assistantMessage: replacement,
      messages: convo,
      controller,
      turn,
      settings,
      plugins,
      toolDefinition: undefined,
      startBuffered: false,
      pipeline,
    });
  } finally {
    set((state) => ({
      ui: adjustActiveTurnCount(state.ui, chatId, -1),
    }));
  }
}

const isReasoningEffort = (
  value: unknown,
): value is NonNullable<Chat['settings']['generation']['reasoningEffort']> =>
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
