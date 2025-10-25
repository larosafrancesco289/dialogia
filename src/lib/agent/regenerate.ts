// Module: agent/regenerate
// Responsibility: Support regeneration of assistant messages with preserved settings.

import { buildChatCompletionMessages } from '@/lib/agent/conversation';
import { composePlugins } from '@/lib/agent/request';
import type { Chat, Message } from '@/lib/types';
import { ProviderSort } from '@/lib/models/providerSort';
import type { RegenerateOptions, SearchProvider } from '@/lib/agent/types';
import { streamFinal } from '@/lib/agent/streaming';
import { setTurnController } from '@/lib/services/controllers';

export async function regenerate(opts: RegenerateOptions): Promise<void> {
  const {
    chat,
    chatId,
    targetMessageId,
    messages,
    models,
    modelIndex,
    apiKey,
    transport = 'openrouter',
    controller,
    set,
    get,
    persistMessage,
    overrideModelId,
  } = opts;

  const index = messages.findIndex((msg) => msg.id === targetMessageId);
  if (index < 0) return;

  const original = messages[index];
  const priorMessages = messages.slice(0, index);
  const payload = buildChatCompletionMessages({ chat, priorMessages, models });
  const systemSnapshot: string | undefined = (original as any)?.systemSnapshot;
  const convo = systemSnapshot
    ? ([{ role: 'system', content: systemSnapshot } as const] as any[]).concat(
        payload.filter((entry: any) => entry.role !== 'system'),
      )
    : payload;

  const hadPdfEarlier = priorMessages.some(
    (msg) =>
      Array.isArray(msg.attachments) && msg.attachments.some((att: any) => att?.kind === 'pdf'),
  );

  const modelIdForTurn = overrideModelId || chat.settings.model;
  const modelMeta = modelIndex.get(modelIdForTurn);
  const caps = modelIndex.caps(modelIdForTurn);
  const supportsReasoning = caps.canReason;

  const snapshotSettings = ((original as any)?.genSettings as Record<string, unknown>) || {};
  const previousModelId =
    typeof (original as any)?.model === 'string' ? (original as any).model : undefined;
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
    const fromSnapshot = typeof snapshotVal === 'string' ? (snapshotVal as any) : undefined;
    const fromChat = typeof chatVal === 'string' ? (chatVal as any) : undefined;
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

  const pickProvider = (
    snapshotVal: unknown,
    chatVal: unknown,
  ): SearchProvider | undefined => {
    const fromSnapshot = typeof snapshotVal === 'string' ? (snapshotVal as any) : undefined;
    const fromChat = typeof chatVal === 'string' ? (chatVal as any) : undefined;
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
    (chat.settings as any)?.search_enabled,
    false,
  );
  const searchProvider = pickProvider(
    snapshotSettings.search_provider,
    (chat.settings as any)?.search_provider,
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

  const appliedGenSettings: Record<string, unknown> = {};
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

  const replacement: Message = {
    id: original.id,
    chatId,
    role: 'assistant',
    content: '',
    createdAt: original.createdAt,
    model: modelIdForTurn,
    reasoning: '',
    attachments: [],
    systemSnapshot,
    genSettings: appliedGenSettings,
  } as Message;

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

  await streamFinal({
    chat: chatForStream,
    chatId,
    assistantMessage: replacement,
    messages: convo,
    controller,
    apiKey,
    transport,
    providerSort: providerSort ?? undefined,
    set,
    get,
    models,
    modelIndex,
    persistMessage,
    plugins,
    toolDefinition: undefined,
    startBuffered: false,
  });
}
