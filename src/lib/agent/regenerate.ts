// Module: agent/regenerate
// Responsibility: Support regeneration of assistant messages with preserved settings.

import { buildChatCompletionMessages } from '@/lib/agent/prompt-builder';
import { composePlugins } from '@/lib/agent/request';
import type { Chat, GenSettingsSnapshot } from '@/lib/types';
import { ProviderSort } from '@/lib/models/providerSort';
import type { ModelMessage, RegenerateOptions, SearchProvider } from '@/lib/agent/types';
import { streamFinal } from '@/lib/agent/streaming';
import { setTurnController } from '@/lib/services/controllers';
import { createAssistantMessage } from '@/lib/messages/createMessage';
import { resolveTurnSettings } from '@/lib/settings/resolve';
import { getCookie } from '@/lib/auth/cookies.client';
import { TIER_COOKIE_NAME } from '@/lib/auth/shared';
import type { AccessTier } from '@/lib/auth/types';

export async function regenerate(opts: RegenerateOptions): Promise<void> {
  const { chat, chatId, targetMessageId, messages, turn, controller, overrideModelId } = opts;
  const { models, modelIndex, set } = turn;

  const index = messages.findIndex((msg) => msg.id === targetMessageId);
  if (index < 0) return;

  const original = messages[index];
  const priorMessages = messages.slice(0, index);
  const payload = buildChatCompletionMessages({ chat, priorMessages, models });
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

  const modelIdForTurn = overrideModelId || chat.settings.model;
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
  ): 'none' | 'low' | 'medium' | 'high' | undefined => {
    if (!supportsReasoning) return undefined;
    const fromSnapshot = isReasoningEffort(snapshotVal) ? snapshotVal : undefined;
    const fromChat = isReasoningEffort(chatVal) ? chatVal : undefined;
    if (modelChanged) return fromChat ?? fromSnapshot;
    return fromSnapshot ?? fromChat;
  };

  const pickReasoningTokens = (snapshotVal: unknown, chatVal: unknown): number | undefined => {
    if (!supportsReasoning) return undefined;
    const fromSnapshot = typeof snapshotVal === 'number' ? snapshotVal : undefined;
    const fromChat = typeof chatVal === 'number' ? chatVal : undefined;
    if (modelChanged) return fromChat ?? fromSnapshot;
    return fromSnapshot ?? fromChat;
  };

  const pickBoolean = (snapshotVal: unknown, chatVal: unknown, fallback = false): boolean => {
    const fromSnapshot = typeof snapshotVal === 'boolean' ? snapshotVal : undefined;
    const fromChat = typeof chatVal === 'boolean' ? chatVal : undefined;
    if (modelChanged) return fromChat ?? fromSnapshot ?? fallback;
    return fromSnapshot ?? fromChat ?? fallback;
  };

  const pickProvider = (snapshotVal: unknown, chatVal: unknown): SearchProvider | undefined => {
    const fromSnapshot = isSearchProvider(snapshotVal) ? snapshotVal : undefined;
    const fromChat = isSearchProvider(chatVal) ? chatVal : undefined;
    if (modelChanged) return fromChat ?? fromSnapshot;
    return fromSnapshot ?? fromChat;
  };

  const temperature = pickNumber(snapshotSettings.temperature, chat.settings.temperature);
  const topP = pickNumber(snapshotSettings.top_p, chat.settings.top_p);
  const maxTokens = pickNumber(snapshotSettings.max_tokens, chat.settings.max_tokens);
  const reasoningEffort = pickReasoningEffort(
    snapshotSettings.reasoning_effort,
    chat.settings.reasoning_effort,
  );
  const reasoningTokens = pickReasoningTokens(
    snapshotSettings.reasoning_tokens,
    chat.settings.reasoning_tokens,
  );
  const searchEnabled = pickBoolean(
    snapshotSettings.search_enabled,
    chat.settings.search_enabled,
    false,
  );
  const searchProvider = pickProvider(
    snapshotSettings.search_provider,
    chat.settings.search_provider,
  );
  const tutorModeForTurn = pickBoolean(
    snapshotSettings.tutor_mode,
    chat.settings.tutor_mode,
    false,
  );
  const providerSortSnapshot = (snapshotSettings as Record<string, unknown>).providerSort;
  const providerSort: ProviderSort | undefined =
    providerSortSnapshot === ProviderSort.Price || providerSortSnapshot === ProviderSort.Throughput
      ? (providerSortSnapshot as ProviderSort)
      : undefined;

  const appliedGenSettings: GenSettingsSnapshot = {};
  if (typeof temperature === 'number') appliedGenSettings.temperature = temperature;
  if (typeof topP === 'number') appliedGenSettings.top_p = topP;
  if (typeof maxTokens === 'number') appliedGenSettings.max_tokens = maxTokens;
  if (supportsReasoning && typeof reasoningEffort === 'string')
    appliedGenSettings.reasoning_effort = reasoningEffort;
  if (supportsReasoning && typeof reasoningTokens === 'number')
    appliedGenSettings.reasoning_tokens = reasoningTokens;
  appliedGenSettings.search_enabled = !!searchEnabled;
  if (searchProvider) appliedGenSettings.search_provider = searchProvider;
  appliedGenSettings.tutor_mode = !!tutorModeForTurn;
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
    messages: {
      ...state.messages,
      [chatId]: (state.messages[chatId] ?? []).map((entry) =>
        entry.id === original.id ? replacement : entry,
      ),
    },
    ui: { ...state.ui, isStreaming: true },
  }));
  setTurnController(chatId, controller);

  const plugins = composePlugins({
    hasPdf: hadPdfEarlier,
    searchEnabled,
    searchProvider: searchProvider || 'openrouter',
  });

  const nextSettings: Chat['settings'] = { ...chat.settings, model: modelIdForTurn };
  if (typeof temperature === 'number') nextSettings.temperature = temperature;
  if (typeof topP === 'number') nextSettings.top_p = topP;
  if (typeof maxTokens === 'number') nextSettings.max_tokens = maxTokens;
  if (supportsReasoning && typeof reasoningEffort === 'string')
    nextSettings.reasoning_effort = reasoningEffort;
  if (supportsReasoning && typeof reasoningTokens === 'number')
    nextSettings.reasoning_tokens = reasoningTokens;
  nextSettings.search_enabled = !!searchEnabled;
  if (searchProvider) nextSettings.search_provider = searchProvider;
  nextSettings.tutor_mode = !!tutorModeForTurn;

  const chatForStream: Chat = { ...chat, settings: nextSettings };

  const uiSnapshot = turn.get().ui;
  const tierCookie = getCookie(TIER_COOKIE_NAME);
  const tier: AccessTier =
    tierCookie === 'developer' || tierCookie === 'individual' || tierCookie === 'study'
      ? tierCookie
      : 'free';
  const settings = resolveTurnSettings({
    chat: chatForStream,
    ui: { ...uiSnapshot, overrides: undefined },
    modelIndex,
    modelId: modelIdForTurn,
    tier,
  });
  settings.generation.providerSort = providerSort;

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
  });
}

const isReasoningEffort = (
  value: unknown,
): value is NonNullable<Chat['settings']['reasoning_effort']> =>
  value === 'none' || value === 'low' || value === 'medium' || value === 'high';

const isSearchProvider = (value: unknown): value is SearchProvider =>
  value === 'brave' || value === 'openrouter';
