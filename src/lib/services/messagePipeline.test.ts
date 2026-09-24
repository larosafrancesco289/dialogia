import { deleteKey } from '@/lib/keys/store';
import { OPENROUTER_ENDPOINT } from '@/lib/transport/endpoints';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { regenerate } from '@/lib/agent/regenerate';
import { createPipelineClient } from '@/lib/agent/pipelineClient';
import { createModelIndex } from '@/lib/models';
import type { Message, Chat, ModelDescriptor } from '@/lib/types';
import type { TurnContext } from '@/lib/agent/types';
import { ProviderSort } from '@/lib/models/providerSort';
import { buildMessageIndex } from '@/lib/messages/indexing';
import { buildTransportAuth } from '@/lib/auth/transport';
import { createAssistantMessage, createUserMessage } from '@/lib/messages/createMessage';
import { createTestStoreState } from '../../../tests/helpers/createTestStoreState';
import { makeChat } from '../../../tests/helpers/makeChat';

const baseModels: ModelDescriptor[] = [
  {
    id: 'provider/model',
    name: 'Provider Model',
    context_length: 16000,
    pricing: undefined,
    raw: {},
  },
];

async function runRegenerate(chat: Chat, reply: Partial<Message>, content: string) {
  const user = createUserMessage({
    id: `${chat.id}-user`,
    chatId: chat.id,
    content: 'Question',
    createdAt: Date.now() - 10,
  });
  const assistant: Message = {
    ...createAssistantMessage({
      id: `${chat.id}-assistant`,
      chatId: chat.id,
      content: 'Old content',
      model: chat.settings.modelId,
    }),
    ...reply,
  };
  const { state, set, get } = createTestStoreState({
    chats: [chat],
    ...buildMessageIndex({ [chat.id]: [user, assistant] }),
    models: baseModels,
    modelIndex: createModelIndex(baseModels),
  });
  state.ui.flags = { ...state.ui.flags, experimentalTutor: false };
  state.ui.debug = { ...state.ui.debug, mode: true };

  const saved: Message[] = [];
  await regenerate({
    chat,
    chatId: chat.id,
    targetMessageId: assistant.id,
    messages: [user, assistant],
    turn: {
      auth: buildTransportAuth({ endpoint: OPENROUTER_ENDPOINT, apiKey: 'test' }),
      set,
      get,
      models: baseModels,
      modelIndex: createModelIndex(baseModels),
      persistMessage: async (message: Message) => {
        saved.push(message);
      },
    } satisfies TurnContext,
    controller: new AbortController(),
    pipeline: createPipelineClient({
      streamChatCompletion: async ({ callbacks }) => {
        callbacks?.onStart?.();
        callbacks?.onToken?.(content);
        callbacks?.onDone?.(content, { usage: { prompt_tokens: 5 } });
      },
    }),
  });

  const debugBody = state.ui.debug.byMessageId?.[assistant.id]?.body;
  return {
    state,
    saved,
    updated: state.messagesById[assistant.id],
    request: debugBody ? JSON.parse(debugBody) : undefined,
  };
}

test('regenerate reuses snapshots and records debug payload', async () => {
  const chat = makeChat({
    id: 'chat-regen',
    settings: {
      system: 'Be formal.',
      generation: {
        temperature: 0.1,
        topP: 0.8,
        maxTokens: 200,
        reasoningEffort: 'low',
        reasoningTokens: 256,
      },
      features: { tutor: { enabled: false, defaultModelId: 'provider/model' } },
    },
  });

  const { state, saved, updated, request } = await runRegenerate(
    chat,
    {
      systemSnapshot: 'Snapshot system',
      genSettings: {
        temperature: 0.3,
        topP: 0.7,
        maxTokens: 150,
        providerSort: ProviderSort.Price,
        searchEnabled: true,
        searchProvider: 'openrouter',
      },
    },
    'Hello',
  );

  assert.equal(updated.content, 'Hello');
  assert.equal(updated.genSettings?.providerSort, ProviderSort.Price);
  assert.equal(updated.genSettings?.searchEnabled, true);
  assert.equal(request?.model, 'provider/model');
  assert.equal(state.ui.activeTurnByChatId[chat.id] ?? 0, 0);
  assert.ok(saved.length > 0);
});

test('regenerate keeps search alive when a keyless provider degrades to native', async () => {
  // The chat asks for Tavily; this machine has no Tavily key, so the turn
  // resolves to provider-native search — which is delivered by the `web`
  // plugin. Building the plugins before that fallback drops search entirely.
  await deleteKey('tavily');
  const chat = makeChat({
    id: 'chat-regen-search',
    settings: {
      system: 'Be brief.',
      generation: { maxTokens: 200 },
      features: { search: { enabled: true, provider: 'tavily' } },
    },
  });

  const { request } = await runRegenerate(
    chat,
    { genSettings: { searchEnabled: true, searchProvider: 'tavily' } },
    'Hi',
  );

  assert.deepEqual(request?.plugins, [{ id: 'web' }]);
});
