import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPipelineClient } from '@/lib/agent/pipelineClient';
import { HeadlessTutorSession } from '@/tooling/headless/session';
import { createModelIndex } from '@/lib/models';
import { DEFAULT_BASE_SYSTEM } from '@/lib/agent/prompts/baseSystem';
import type { Chat, Message, ModelDescriptor } from '@/lib/types';
import { buildTransportAuth } from '@/lib/auth/transport';

const mockModel = (id: string): ModelDescriptor => ({
  id,
  name: id,
  context_length: 8000,
  transport: 'openrouter',
  raw: { supported_parameters: ['tools', 'reasoning'] },
});

const mockChat = (modelId: string): Chat => ({
  id: 'chat-1',
  title: 'Test Chat',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  settings: {
    system: DEFAULT_BASE_SYSTEM,
    modelId,
    generation: {},
    ui: {
      showThinkingByDefault: false,
      showStats: false,
      showToolCallLog: true,
      showDebugRawJson: true,
    },
    features: {
      search: { enabled: false, provider: 'openrouter' },
      tutor: { enabled: true, defaultModelId: modelId, enableLearnerModel: true },
    },
  },
});

test('headless tutor session streams a response and captures artifacts', async () => {
  const pipeline = createPipelineClient({
    chatCompletion: async () => ({
      id: 'planning-mock',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'mock-model',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Proceed to respond normally.' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }),
    streamChatCompletion: async (params) => {
      const { callbacks } = params;
      callbacks?.onStart?.();
      callbacks?.onToken?.('Hello student!');
      callbacks?.onDone?.('Hello student!', { usage: { total_tokens: 12 } });
    },
  });

  const model = mockModel('openrouter/test-model');
  const chat = mockChat(model.id);

  const session = new HeadlessTutorSession({
    chat,
    models: [model],
    modelIndex: createModelIndex([model]),
    resolveAuth: () =>
      buildTransportAuth({ transport: 'openrouter', apiKey: 'test-key', useProxy: false }),
    pipeline,
    uiOverrides: {
      debug: { mode: true },
      flags: { experimentalTutor: true },
      tutor: { forceMode: true },
    },
  });

  const turn = await session.runTurn('Can you help me understand limits?');
  assert.equal(turn.assistant.content, 'Hello student!');
  assert.equal(turn.user.content.includes('limits'), true);
  assert.equal(turn.artifacts.plan.usedTutorContentTool, false);
  assert.ok(Array.isArray(turn.artifacts.toolCalls));

  const messages: Message[] = session.getMessages();
  assert.equal(messages.length, 2);
  const assistant = messages[1];
  assert.equal(assistant.role, 'assistant');
  assert.equal(assistant.content, 'Hello student!');
});
