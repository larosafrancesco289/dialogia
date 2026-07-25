import { OPENROUTER_ENDPOINT } from '@/lib/transport/endpoints';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { streamFinal } from './streaming';
import { createPipelineClient } from './pipelineClient';
import { createTestStoreState } from '../../../tests/helpers/createTestStoreState';
import { buildTransportAuth } from '@/lib/auth/transport';
import type { Chat, Message } from '@/lib/types';
import type { ModelMessage } from '@/lib/agent/types';

test('streamFinal rebuilds multipart system prompt when stable split is provided', async () => {
  const chatId = 'chat-cache-test';
  const assistantMessage: Message = {
    id: 'assistant-1',
    chatId,
    role: 'assistant',
    content: '',
    createdAt: Date.now(),
  };

  const chat: Chat = {
    id: chatId,
    title: 'Cache test',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    settings: {
      modelId: 'openrouter/test-model',
      generation: {},
      ui: {
        showThinkingByDefault: false,
        showStats: false,
        showToolCallLog: false,
        showDebugRawJson: false,
      },
      features: {
        search: { enabled: false, provider: 'openrouter' },
        tutor: { enabled: true },
      },
    },
  };

  const { state, set, get } = createTestStoreState({
    messagesById: { [assistantMessage.id]: assistantMessage },
    messageIdsByChatId: { [chatId]: [assistantMessage.id] },
  });

  const systemStable = 'Stable tutor preamble';
  const systemDynamic = 'Dynamic learner model';
  const combinedSystem = `${systemStable}\n\n${systemDynamic}\n\nSources:\n- https://example.com`;

  const messages: ModelMessage[] = [
    { role: 'system', content: combinedSystem },
    { role: 'user', content: 'Earlier user message' },
    { role: 'assistant', content: 'Earlier assistant message' },
    { role: 'user', content: 'Latest user message' },
  ];

  let capturedMessages: ModelMessage[] | undefined;
  const pipeline = createPipelineClient({
    streamChatCompletion: async (params) => {
      capturedMessages = params.messages;
      params.callbacks?.onDone?.('', { finishReason: 'stop' });
    },
  });

  await streamFinal({
    chat,
    chatId,
    assistantMessage,
    messages,
    controller: new AbortController(),
    turn: {
      auth: buildTransportAuth({ endpoint: OPENROUTER_ENDPOINT, apiKey: 'test-key' }),
      set,
      get,
      models: [],
      modelIndex: state.modelIndex,
      persistMessage: async () => undefined,
    },
    settings: {
      modelId: chat.settings.modelId,
      modelMeta: undefined,
      caps: { canReason: false, canSee: false, canAudio: false, canImageOut: false },
      generation: {},
      searchEnabled: false,
      searchProvider: 'openrouter',
      tutorEnabled: true,
      timestampsEnabled: false,
      system: chat.settings.system,
    },
    startBuffered: false,
    systemStable,
    systemDynamic,
    pipeline,
  });

  assert.ok(capturedMessages, 'expected stream call to capture messages');
  assert.equal(capturedMessages.filter((msg) => msg.role === 'system').length, 1);

  const systemMessage = capturedMessages[0];
  assert.equal(systemMessage?.role, 'system');
  assert.ok(Array.isArray(systemMessage?.content));
  if (!Array.isArray(systemMessage.content)) return;
  assert.equal(systemMessage.content[0]?.type, 'text');
  assert.equal(systemMessage.content[0]?.text, systemStable);
  assert.deepEqual(systemMessage.content[0]?.cache_control, { type: 'ephemeral' });
  assert.equal(systemMessage.content[1]?.type, 'text');
  assert.equal(
    systemMessage.content[1]?.text,
    `${systemDynamic}\n\nSources:\n- https://example.com`,
  );

  const planningPrefix = capturedMessages.find((msg) => msg.role === 'assistant');
  assert.ok(planningPrefix, 'expected assistant prefix message');
  assert.ok(Array.isArray(planningPrefix.content));
  if (!Array.isArray(planningPrefix.content)) return;
  const lastBlock = planningPrefix.content[planningPrefix.content.length - 1];
  assert.equal(lastBlock?.type, 'text');
  if (lastBlock?.type !== 'text') return;
  assert.deepEqual(lastBlock?.cache_control, { type: 'ephemeral' });
});
