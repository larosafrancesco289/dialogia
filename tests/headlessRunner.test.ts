import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPipelineClient } from '@/lib/agent/pipelineClient';
import { createHeadlessRunner } from '@/modules/tutor/tooling/runner';
import { renderSnapshotTranscript } from '@/modules/tutor/tooling/transcript';
import { createModelIndex } from '@/lib/models';
import { DEFAULT_BASE_SYSTEM } from '@/lib/agent/prompts/baseSystem';
import type { Chat, ModelDescriptor } from '@/lib/types';
import { buildTransportAuth } from '@/lib/auth/transport';

const mockModel = (id: string): ModelDescriptor => ({
  id,
  name: id,
  context_length: 8000,
  transport: 'openrouter',
  raw: { supported_parameters: ['tools', 'reasoning'] },
});

const mockChat = (modelId: string): Chat => ({
  id: 'chat-runner',
  title: 'Runner Test Chat',
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

test('headless runner builds snapshots with debug payloads and metrics', async () => {
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
      callbacks?.onDone?.('Hello student!', {
        usage: { prompt_tokens: 9, completion_tokens: 3, total_tokens: 12 },
      });
    },
  });

  const model = mockModel('openrouter/test-model');
  const chat = mockChat(model.id);

  const runner = createHeadlessRunner({
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

  const snapshot = await runner.runTurn({
    content: 'Can you explain the chain rule?',
    turnIndex: 0,
  });
  const result = runner.toResult();

  assert.equal(snapshot.turnIndex, 0);
  assert.equal(snapshot.user.content.includes('chain rule'), true);
  assert.equal(snapshot.assistant.content, 'Hello student!');
  assert.ok(Array.isArray(snapshot.assistant.toolCalls));
  assert.ok(typeof snapshot.assistant.debugRequestBody === 'string');
  assert.ok(typeof snapshot.composition.shouldPlan === 'boolean');
  assert.equal(snapshot.assistant.metrics?.promptTokens, 9);
  assert.equal(snapshot.assistant.metrics?.completionTokens, 3);
  assert.equal(result.snapshots.length, 1);
  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[1].id, snapshot.assistant.id);

  const transcript = renderSnapshotTranscript(result.snapshots);
  assert.equal(transcript.includes('Tutor'), true);
  assert.equal(transcript.includes('Student'), true);
});
