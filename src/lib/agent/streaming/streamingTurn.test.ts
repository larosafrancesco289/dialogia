import { ANTHROPIC_ENDPOINT, OPENROUTER_ENDPOINT } from '@/lib/transport/endpoints';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeStreamingTurn } from '@/lib/agent/streaming/streamingTurn';
import { createPipelineClient } from '@/lib/agent/pipelineClient';
import { buildTransportAuth } from '@/lib/auth/transport';
import { createModelIndex } from '@/lib/models';
import { createAssistantMessage } from '@/lib/messages/createMessage';
import { buildMessageIndex } from '@/lib/messages/indexing';
import type { Message, ModelDescriptor } from '@/lib/types';
import type { ModelMessage, ToolDefinition } from '@/lib/agent/types';
import type { StoreGetter, StoreSetter } from '@/lib/store/types';
import type { StreamCallbacks } from '@/lib/transport/types';
import { createTestStoreState } from '../../../../tests/helpers/createTestStoreState';
import { makeChat } from '../../../../tests/helpers/makeChat';

// Tools no module registers: their calls fail as unsupported, which is what
// these draft-keeping paths are about.
const TOOLS: ToolDefinition[] = ['advance_topic', 'quiz'].map((name) => ({
  type: 'function',
  function: { name, description: name, parameters: { type: 'object', properties: {} } },
}));

const OPENROUTER_MODEL: ModelDescriptor = {
  id: 'provider/model',
  name: 'Provider Model',
  context_length: 16000,
  pricing: undefined,
  raw: { supported_parameters: ['tools'] },
};

type Round = (ctx: {
  callbacks: StreamCallbacks | undefined;
  messages: ModelMessage[];
  get: StoreGetter;
  set: StoreSetter;
  assistantId: string;
}) => void;

/** Streams a draft, then asks for one tool. */
const draftThenTool =
  (draft: string, name: string, args = '{}'): Round =>
  ({ callbacks }) => {
    callbacks?.onToken?.(draft);
    callbacks?.onDone?.(draft, {
      finishReason: 'tool_calls',
      toolCalls: [{ id: 'call_1', type: 'function', function: { name, arguments: args } }],
    });
  };

const finish =
  (text: string): Round =>
  ({ callbacks }) =>
    callbacks?.onDone?.(text, { finishReason: 'stop' });

/** One tutor turn through `executeStreamingTurn`, answering each model call with the next round. */
async function runTurn({
  rounds,
  model = OPENROUTER_MODEL,
  endpoint = OPENROUTER_ENDPOINT,
  startBuffered = false,
}: {
  rounds: Round[];
  model?: ModelDescriptor;
  endpoint?: typeof OPENROUTER_ENDPOINT;
  startBuffered?: boolean;
}) {
  const chatId = `chat-streaming-${Math.random().toString(36).slice(2)}`;
  const chat = makeChat({
    id: chatId,
    title: 'Tutor chat',
    settings: {
      modelId: model.id,
      features: { tutor: { enabled: true, defaultModelId: model.id } },
    },
  });
  const assistantMessage = createAssistantMessage({
    id: `${chatId}-assistant`,
    chatId,
    content: '',
    model: model.id,
    createdAt: Date.now(),
  });
  const { state, set, get } = createTestStoreState({
    chats: [chat],
    ...buildMessageIndex({ [chatId]: [assistantMessage] }),
    models: [model],
    modelIndex: createModelIndex([model]),
  });

  const persisted: Message[] = [];
  const roles: string[][] = [];
  const pipeline = createPipelineClient({
    streamChatCompletion: async ({ callbacks, messages }) => {
      roles.push(messages.map((message) => message.role));
      const round = rounds[Math.min(roles.length, rounds.length) - 1];
      round({ callbacks, messages, get, set, assistantId: assistantMessage.id });
    },
  });

  const userContent = 'Teach me one-step equations.';
  const result = await executeStreamingTurn({
    chat,
    chatId,
    assistantMessage,
    messages: [
      { role: 'system', content: 'You are a tutor.' },
      { role: 'user', content: userContent },
    ],
    controller: new AbortController(),
    turn: {
      auth: buildTransportAuth({ endpoint, apiKey: 'test-key' }),
      set,
      get,
      models: [model],
      modelIndex: state.modelIndex,
      persistMessage: async (message) => {
        persisted.push(message);
      },
    },
    settings: {
      modelId: model.id,
      modelMeta: model,
      caps: { canReason: false, canSee: false, canAudio: false, canImageOut: false },
      generation: {},
      searchEnabled: false,
      searchProvider: 'openrouter',
      tutorEnabled: true,
      timestampsEnabled: false,
      system: undefined,
    },
    toolDefinition: TOOLS,
    startBuffered,
    userContent,
    combinedSystem: 'You are a tutor.',
    pipeline,
  });

  return {
    result,
    calls: roles.length,
    roles,
    content: get().messagesById[assistantMessage.id]?.content,
    lastPersisted: persisted[persisted.length - 1]?.content,
  };
}

const GOOD_DRAFT =
  'Great start. Isolate x first, then divide both sides by the coefficient to solve it.';

test('executeStreamingTurn keeps the pre-tool draft and skips final overwrite for meta-only rounds', async () => {
  const run = await runTurn({
    rounds: [
      draftThenTool(GOOD_DRAFT, 'advance_topic'),
      finish('internal_follow_up'),
      finish('short replacement'),
    ],
  });

  assert.equal(run.calls, 2, 'should not run a final overwrite streaming call');
  assert.equal(run.result.shortCircuited, true);
  assert.equal(run.content, GOOD_DRAFT);
  assert.equal(run.lastPersisted, GOOD_DRAFT);
});

test('executeStreamingTurn prefers complete fallback draft over incomplete current content', async () => {
  const run = await runTurn({
    startBuffered: true,
    rounds: [
      draftThenTool(GOOD_DRAFT, 'advance_topic'),
      ({ callbacks, get, set, assistantId }) => {
        const current = get().messagesById[assistantId];
        assert.ok(current, 'assistant message should exist before finalize');
        set((store) => ({
          messagesById: {
            ...store.messagesById,
            [assistantId]: { ...current, content: 'Great start,' },
          },
        }));
        callbacks?.onDone?.('internal_follow_up', { finishReason: 'stop' });
      },
      finish('short replacement'),
    ],
  });

  assert.equal(run.calls, 2, 'should not run a final overwrite streaming call');
  assert.equal(run.result.shortCircuited, true);
  assert.equal(run.content, GOOD_DRAFT);
  assert.equal(run.lastPersisted, GOOD_DRAFT);
});

test('executeStreamingTurn keeps draft when all tool calls fail to execute', async () => {
  const draft = 'Let me quickly quiz you before we proceed.';
  const run = await runTurn({
    rounds: [
      draftThenTool(draft, 'quiz', '{"type":"object"}'),
      finish('tool call failed'),
      finish('replacement text'),
    ],
  });

  assert.equal(run.calls, 2, 'should skip final overwrite call after failed tools');
  assert.equal(run.result.shortCircuited, true);
  assert.equal(run.content, draft);
  assert.equal(run.lastPersisted, draft);
});

test('executeStreamingTurn does not preserve incomplete draft when tools fail', async () => {
  const finalReply = 'Thanks for waiting. Let us continue with one-step equations now.';
  const run = await runTurn({
    rounds: [
      draftThenTool('Let me quickly quiz you before we proceed:', 'quiz', '{"type":"object"}'),
      finish('tool call failed'),
      finish(finalReply),
    ],
  });

  assert.equal(run.calls, 3, 'should run final completion call for incomplete draft');
  assert.notEqual(run.result.shortCircuited, true);
  assert.equal(run.content, finalReply);
  assert.equal(run.lastPersisted, finalReply);
});

test('executeStreamingTurn omits follow-up user prompt after Anthropic tool results', async () => {
  const draft =
    'You nailed the first step. Keep isolating x, and then check your answer by substitution.';
  const run = await runTurn({
    endpoint: ANTHROPIC_ENDPOINT,
    model: {
      id: 'anthropic-direct/claude-haiku-4-5',
      name: 'Claude Haiku 4.5',
      context_length: 200000,
      pricing: undefined,
      raw: { supported_parameters: ['tools'] },
      endpointId: 'anthropic',
      transportModelId: 'claude-haiku-4-5-20251001',
      providerDisplay: 'Anthropic',
    },
    rounds: [draftThenTool(draft, 'advance_topic'), finish('internal follow up')],
  });

  assert.equal(run.calls, 2, 'Anthropic flow should short-circuit after tool round draft');
  assert.equal(run.result.shortCircuited, true);
  assert.deepEqual(run.roles[1], ['system', 'user', 'assistant', 'tool']);
  assert.equal(run.content, draft);
  assert.equal(run.lastPersisted, draft);
});
