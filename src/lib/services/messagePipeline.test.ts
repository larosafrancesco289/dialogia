import { deleteKey } from '@/lib/keys/store';
import { OPENROUTER_ENDPOINT } from '@/lib/transport/endpoints';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { regenerate } from '@/lib/agent/regenerate';
import { createPipelineClient } from '@/lib/agent/pipelineClient';
import { createModelIndex } from '@/lib/models';
import type { Message, Chat, ModelDescriptor } from '@/lib/types';
import type { StoreSetter, TurnContext } from '@/lib/agent/types';
import { ProviderSort } from '@/lib/models/providerSort';
import { buildMessageIndex } from '@/lib/messages/indexing';
import { buildTransportAuth } from '@/lib/auth/transport';

const baseModels: ModelDescriptor[] = [
  {
    id: 'provider/model',
    name: 'Provider Model',
    context_length: 16000,
    pricing: undefined,
    raw: {},
  },
];

const mergeState = (target: any, patch: any) => {
  if (!patch) return;
  Object.entries(patch).forEach(([key, value]) => {
    target[key] = value;
  });
};

test('regenerate reuses snapshots and records debug payload', async () => {
  const chat: Chat = {
    id: 'chat-regen',
    title: 'Regen Chat',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    folderId: undefined,
    settings: {
      modelId: 'provider/model',
      system: 'Be formal.',
      generation: {
        temperature: 0.1,
        topP: 0.8,
        maxTokens: 200,
        reasoningEffort: 'low',
        reasoningTokens: 256,
      },
      ui: {
        showThinkingByDefault: false,
        showStats: false,
        showToolCallLog: false,
        showDebugRawJson: true,
      },
      features: {
        search: { enabled: false, provider: 'openrouter' },
        tutor: { enabled: false, defaultModelId: 'provider/model' },
      },
    },
  };
  const assistantMessage: Message = {
    id: 'assistant-regen',
    chatId: chat.id,
    role: 'assistant',
    content: 'Old content',
    createdAt: Date.now(),
    model: chat.settings.modelId,
    reasoning: '',
    attachments: [],
    systemSnapshot: 'Snapshot system',
    genSettings: {
      temperature: 0.3,
      topP: 0.7,
      maxTokens: 150,
      providerSort: ProviderSort.Price,
      searchEnabled: true,
      searchProvider: 'openrouter',
    },
  };
  const userMessage: Message = {
    id: 'user-regen',
    chatId: chat.id,
    role: 'user',
    content: 'Question',
    createdAt: Date.now() - 10,
  } as Message;

  const { messagesById: regenMessagesById, messageIdsByChatId: regenMessageIdsByChatId } =
    buildMessageIndex({
      [chat.id]: [userMessage, assistantMessage],
    });

  const state: any = {
    chats: [chat],
    messagesById: regenMessagesById,
    messageIdsByChatId: regenMessageIdsByChatId,
    models: baseModels,
    modelIndex: createModelIndex(baseModels),
    ui: {
      notice: undefined,
      routePreference: 'speed',
      activeTurnByChatId: {},
      flags: {
        experimentalTutor: false,
      },
      debug: {
        mode: true,
        byMessageId: {},
        autoReasoningModelIds: {},
      },
      search: { tavilyByMessageId: {} },
      tutor: { forceMode: false },
    },
    setNotice: (notice?: string) => {
      state.ui.notice = notice;
    },
  };

  const saved: Message[] = [];
  const set: StoreSetter = (partial, replace) => {
    if (typeof partial === 'function') {
      const patch = partial(state);
      if (patch) mergeState(state, patch);
    } else if (partial) {
      if (replace) {
        Object.keys(state).forEach((key) => {
          delete (state as any)[key];
        });
      }
      mergeState(state, partial as Partial<typeof state>);
    }
  };
  const get = () => state;

  const pipeline = createPipelineClient({
    streamChatCompletion: async ({ callbacks }) => {
      callbacks?.onStart?.();
      callbacks?.onToken?.('Hello');
      callbacks?.onDone?.('Hello', { usage: { prompt_tokens: 5 } });
    },
  });

  const modelIndexReg = createModelIndex(baseModels);
  const persistRegenerateMessage = async (message: Message) => {
    saved.push(message);
  };
  const regenerateTurn = {
    auth: buildTransportAuth({ endpoint: OPENROUTER_ENDPOINT, apiKey: 'test' }),
    set,
    get,
    models: baseModels,
    modelIndex: modelIndexReg,
    persistMessage: persistRegenerateMessage,
  } satisfies TurnContext;

  await regenerate({
    chat,
    chatId: chat.id,
    targetMessageId: assistantMessage.id,
    messages: [userMessage, assistantMessage],
    turn: regenerateTurn,
    controller: new AbortController(),
    pipeline,
  });

  const updatedMessage = state.messagesById[assistantMessage.id];
  assert.equal(updatedMessage.content, 'Hello');
  assert.equal(updatedMessage.genSettings.providerSort, ProviderSort.Price);
  assert.equal(updatedMessage.genSettings.searchEnabled, true);
  const debugEntry = state.ui.debug.byMessageId[assistantMessage.id];
  assert.ok(debugEntry);
  const parsed = JSON.parse(debugEntry.body);
  assert.equal(parsed.model, 'provider/model');
  assert.equal(state.ui.activeTurnByChatId[chat.id] ?? 0, 0);
  assert.equal(saved.length > 0, true);
});

test('regenerate keeps search alive when a keyless provider degrades to native', async () => {
  // The chat asks for Tavily; this machine has no Tavily key, so the turn
  // resolves to provider-native search — which is delivered by the `web`
  // plugin. Building the plugins before that fallback drops search entirely.
  await deleteKey('tavily');
  const chat: Chat = {
    id: 'chat-regen-search',
    title: 'Regen Search',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    folderId: undefined,
    settings: {
      modelId: 'provider/model',
      system: 'Be brief.',
      generation: { maxTokens: 200 },
      ui: {
        showThinkingByDefault: false,
        showStats: false,
        showToolCallLog: false,
        showDebugRawJson: true,
      },
      features: {
        search: { enabled: true, provider: 'tavily' },
        tutor: { enabled: false, defaultModelId: 'provider/model' },
      },
    },
  };
  const assistantMessage: Message = {
    id: 'assistant-regen-search',
    chatId: chat.id,
    role: 'assistant',
    content: 'Old content',
    createdAt: Date.now(),
    model: chat.settings.modelId,
    reasoning: '',
    attachments: [],
    genSettings: { searchEnabled: true, searchProvider: 'tavily' },
  };
  const userMessage: Message = {
    id: 'user-regen-search',
    chatId: chat.id,
    role: 'user',
    content: 'Question',
    createdAt: Date.now() - 10,
  } as Message;

  const { messagesById, messageIdsByChatId } = buildMessageIndex({
    [chat.id]: [userMessage, assistantMessage],
  });

  const state: any = {
    chats: [chat],
    messagesById,
    messageIdsByChatId,
    models: baseModels,
    modelIndex: createModelIndex(baseModels),
    ui: {
      notice: undefined,
      routePreference: 'balanced',
      activeTurnByChatId: {},
      flags: { experimentalTutor: false },
      debug: {
        mode: true,
        byMessageId: {},
        autoReasoningModelIds: {},
      },
      search: { tavilyByMessageId: {} },
      tutor: { forceMode: false },
    },
    setNotice: (notice?: string) => {
      state.ui.notice = notice;
    },
  };

  const set: StoreSetter = (partial, replace) => {
    if (typeof partial === 'function') {
      const patch = partial(state);
      if (patch) mergeState(state, patch);
    } else if (partial) {
      if (replace) {
        Object.keys(state).forEach((key) => {
          delete (state as any)[key];
        });
      }
      mergeState(state, partial as Partial<typeof state>);
    }
  };

  const pipeline = createPipelineClient({
    streamChatCompletion: async ({ callbacks }) => {
      callbacks?.onStart?.();
      callbacks?.onToken?.('Hi');
      callbacks?.onDone?.('Hi', {});
    },
  });

  await regenerate({
    chat,
    chatId: chat.id,
    targetMessageId: assistantMessage.id,
    messages: [userMessage, assistantMessage],
    turn: {
      auth: buildTransportAuth({ endpoint: OPENROUTER_ENDPOINT, apiKey: 'test' }),
      set,
      get: () => state,
      models: baseModels,
      modelIndex: createModelIndex(baseModels),
      persistMessage: async () => {},
    } satisfies TurnContext,
    controller: new AbortController(),
    pipeline,
  });

  const debugEntry = state.ui.debug.byMessageId[assistantMessage.id];
  assert.ok(debugEntry);
  const parsed = JSON.parse(debugEntry.body);
  assert.deepEqual(parsed.plugins, [{ id: 'web' }]);
});
