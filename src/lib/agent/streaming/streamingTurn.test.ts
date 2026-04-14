import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeStreamingTurn } from '@/lib/agent/streaming/streamingTurn';
import { createPipelineClient } from '@/lib/agent/pipelineClient';
import { getTutorToolDefinitions } from '@/lib/agent/tutor';
import { buildTransportAuth } from '@/lib/auth/transport';
import { createModelIndex } from '@/lib/models';
import { createAssistantMessage } from '@/lib/messages/createMessage';
import { buildMessageIndex } from '@/lib/messages/indexing';
import type { Chat, Message, ModelDescriptor } from '@/lib/types';
import { createTestStoreState } from '../../../../tests/helpers/createTestStoreState';

test('executeStreamingTurn keeps pre-tool tutor draft and skips final overwrite for meta-only rounds', async () => {
  const chatId = 'chat-streaming-turn-preserve-draft';
  const model: ModelDescriptor = {
    id: 'provider/model',
    name: 'Provider Model',
    context_length: 16000,
    pricing: undefined,
    raw: { supported_parameters: ['tools'] },
  };

  const chat: Chat = {
    id: chatId,
    title: 'Tutor chat',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    settings: {
      modelId: model.id,
      generation: {},
      ui: {
        showThinkingByDefault: false,
        showStats: false,
        showToolCallLog: false,
        showDebugRawJson: false,
      },
      features: {
        search: { enabled: false, provider: 'openrouter' },
        tutor: {
          enabled: true,
          defaultModelId: model.id,
          learningPlan: {
            goal: 'Master linear equations',
            generatedAt: Date.now(),
            updatedAt: Date.now(),
            version: 1,
            nodes: [
              {
                id: 'node-1',
                name: 'Solve one-step equations',
                objectives: ['Solve x + a = b'],
                prerequisites: [],
                status: 'in_progress',
              },
              {
                id: 'node-2',
                name: 'Solve two-step equations',
                objectives: ['Solve ax + b = c'],
                prerequisites: ['node-1'],
                status: 'not_started',
              },
            ],
          },
        },
      },
    },
  };

  const assistantMessage = createAssistantMessage({
    id: 'assistant-1',
    chatId,
    content: '',
    model: model.id,
    createdAt: Date.now(),
  });

  const { messagesById, messageIdsByChatId } = buildMessageIndex({
    [chatId]: [assistantMessage],
  });

  const { state, set, get } = createTestStoreState({
    chats: [chat],
    messagesById,
    messageIdsByChatId,
    models: [model],
    modelIndex: createModelIndex([model]),
  });

  const persisted: Message[] = [];
  const goodDraft =
    'Great start. Isolate x first, then divide both sides by the coefficient to solve it.';

  let streamCallCount = 0;
  const pipeline = createPipelineClient({
    streamChatCompletion: async ({ callbacks }) => {
      streamCallCount += 1;

      if (streamCallCount === 1) {
        callbacks?.onToken?.(goodDraft);
        callbacks?.onDone?.(goodDraft, {
          finishReason: 'tool_calls',
          toolCalls: [
            {
              id: 'call_1',
              type: 'function',
              function: {
                name: 'advance_topic',
                arguments: '{}',
              },
            },
          ],
        });
        return;
      }

      if (streamCallCount === 2) {
        callbacks?.onDone?.('internal_follow_up', { finishReason: 'stop' });
        return;
      }

      callbacks?.onDone?.('short replacement', { finishReason: 'stop' });
    },
  });

  const result = await executeStreamingTurn({
    chat,
    chatId,
    assistantMessage,
    messages: [
      { role: 'system', content: 'You are a tutor.' },
      { role: 'user', content: 'How do I solve 2x + 4 = 10?' },
    ],
    controller: new AbortController(),
    turn: {
      auth: buildTransportAuth({
        transport: 'openrouter',
        apiKey: 'test-key',
        useProxy: false,
      }),
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
      caps: {
        canReason: false,
        canSee: false,
        canAudio: false,
        canImageOut: false,
      },
      generation: {},
      searchEnabled: false,
      searchProvider: 'openrouter',
      tutorEnabled: true,
      system: undefined,
    },
    toolDefinition: getTutorToolDefinitions(),
    startBuffered: false,
    userContent: 'How do I solve 2x + 4 = 10?',
    combinedSystem: 'You are a tutor.',
    pipeline,
  });

  assert.equal(streamCallCount, 2, 'should not run a final overwrite streaming call');
  assert.equal(result.shortCircuited, true);

  const finalMessage = get().messagesById[assistantMessage.id];
  assert.equal(finalMessage?.content, goodDraft);
  assert.ok(!finalMessage?.content.includes('short replacement'));
  assert.equal(persisted[persisted.length - 1]?.content, goodDraft);
});

test('executeStreamingTurn prefers complete fallback draft over incomplete current content', async () => {
  const chatId = 'chat-streaming-turn-prefer-fallback-draft';
  const model: ModelDescriptor = {
    id: 'provider/model',
    name: 'Provider Model',
    context_length: 16000,
    pricing: undefined,
    raw: { supported_parameters: ['tools'] },
  };

  const chat: Chat = {
    id: chatId,
    title: 'Tutor chat',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    settings: {
      modelId: model.id,
      generation: {},
      ui: {
        showThinkingByDefault: false,
        showStats: false,
        showToolCallLog: false,
        showDebugRawJson: false,
      },
      features: {
        search: { enabled: false, provider: 'openrouter' },
        tutor: {
          enabled: true,
          defaultModelId: model.id,
          learningPlan: {
            goal: 'Master linear equations',
            generatedAt: Date.now(),
            updatedAt: Date.now(),
            version: 1,
            nodes: [
              {
                id: 'node-1',
                name: 'Solve one-step equations',
                objectives: ['Solve x + a = b'],
                prerequisites: [],
                status: 'in_progress',
              },
              {
                id: 'node-2',
                name: 'Solve two-step equations',
                objectives: ['Solve ax + b = c'],
                prerequisites: ['node-1'],
                status: 'not_started',
              },
            ],
          },
        },
      },
    },
  };

  const assistantMessage = createAssistantMessage({
    id: 'assistant-2',
    chatId,
    content: '',
    model: model.id,
    createdAt: Date.now(),
  });

  const { messagesById, messageIdsByChatId } = buildMessageIndex({
    [chatId]: [assistantMessage],
  });

  const { state, set, get } = createTestStoreState({
    chats: [chat],
    messagesById,
    messageIdsByChatId,
    models: [model],
    modelIndex: createModelIndex([model]),
  });

  const persisted: Message[] = [];
  const goodDraft =
    'Great start. Isolate x first, then divide both sides by the coefficient to solve it.';
  const incompleteCurrent = 'Great start,';

  let streamCallCount = 0;
  const pipeline = createPipelineClient({
    streamChatCompletion: async ({ callbacks }) => {
      streamCallCount += 1;

      if (streamCallCount === 1) {
        callbacks?.onToken?.(goodDraft);
        callbacks?.onDone?.(goodDraft, {
          finishReason: 'tool_calls',
          toolCalls: [
            {
              id: 'call_1',
              type: 'function',
              function: {
                name: 'advance_topic',
                arguments: '{}',
              },
            },
          ],
        });
        return;
      }

      if (streamCallCount === 2) {
        const current = get().messagesById[assistantMessage.id];
        assert.ok(current, 'assistant message should exist before finalize');
        set((store) => ({
          messagesById: {
            ...store.messagesById,
            [assistantMessage.id]: {
              ...current,
              content: incompleteCurrent,
            },
          },
        }));
        callbacks?.onDone?.('internal_follow_up', { finishReason: 'stop' });
        return;
      }

      callbacks?.onDone?.('short replacement', { finishReason: 'stop' });
    },
  });

  const result = await executeStreamingTurn({
    chat,
    chatId,
    assistantMessage,
    messages: [
      { role: 'system', content: 'You are a tutor.' },
      { role: 'user', content: 'How do I solve 2x + 4 = 10?' },
    ],
    controller: new AbortController(),
    turn: {
      auth: buildTransportAuth({
        transport: 'openrouter',
        apiKey: 'test-key',
        useProxy: false,
      }),
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
      caps: {
        canReason: false,
        canSee: false,
        canAudio: false,
        canImageOut: false,
      },
      generation: {},
      searchEnabled: false,
      searchProvider: 'openrouter',
      tutorEnabled: true,
      system: undefined,
    },
    toolDefinition: getTutorToolDefinitions(),
    startBuffered: true,
    userContent: 'How do I solve 2x + 4 = 10?',
    combinedSystem: 'You are a tutor.',
    pipeline,
  });

  assert.equal(streamCallCount, 2, 'should not run a final overwrite streaming call');
  assert.equal(result.shortCircuited, true);

  const finalMessage = get().messagesById[assistantMessage.id];
  assert.equal(finalMessage?.content, goodDraft);
  assert.ok(!finalMessage?.content.includes('short replacement'));
  assert.equal(persisted[persisted.length - 1]?.content, goodDraft);
});

test('executeStreamingTurn keeps draft when all tool calls fail to execute', async () => {
  const chatId = 'chat-streaming-turn-failed-tool-preserve-draft';
  const model: ModelDescriptor = {
    id: 'provider/model',
    name: 'Provider Model',
    context_length: 16000,
    pricing: undefined,
    raw: { supported_parameters: ['tools'] },
  };

  const chat: Chat = {
    id: chatId,
    title: 'Tutor chat',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    settings: {
      modelId: model.id,
      generation: {},
      ui: {
        showThinkingByDefault: false,
        showStats: false,
        showToolCallLog: false,
        showDebugRawJson: false,
      },
      features: {
        search: { enabled: false, provider: 'openrouter' },
        tutor: {
          enabled: true,
          defaultModelId: model.id,
          learningPlan: {
            goal: 'Master linear equations',
            generatedAt: Date.now(),
            updatedAt: Date.now(),
            version: 1,
            nodes: [
              {
                id: 'node-1',
                name: 'Solve one-step equations',
                objectives: ['Solve x + a = b'],
                prerequisites: [],
                status: 'in_progress',
              },
            ],
          },
        },
      },
    },
  };

  const assistantMessage = createAssistantMessage({
    id: 'assistant-3',
    chatId,
    content: '',
    model: model.id,
    createdAt: Date.now(),
  });

  const { messagesById, messageIdsByChatId } = buildMessageIndex({
    [chatId]: [assistantMessage],
  });
  const { state, set, get } = createTestStoreState({
    chats: [chat],
    messagesById,
    messageIdsByChatId,
    models: [model],
    modelIndex: createModelIndex([model]),
  });

  const persisted: Message[] = [];
  const goodDraft = 'Let me quickly quiz you before we proceed.';

  let streamCallCount = 0;
  const pipeline = createPipelineClient({
    streamChatCompletion: async ({ callbacks }) => {
      streamCallCount += 1;

      if (streamCallCount === 1) {
        callbacks?.onToken?.(goodDraft);
        callbacks?.onDone?.(goodDraft, {
          finishReason: 'tool_calls',
          toolCalls: [
            {
              id: 'call_1',
              type: 'function',
              function: {
                name: 'quiz',
                arguments: '{"type":"object"}',
              },
            },
          ],
        });
        return;
      }

      if (streamCallCount === 2) {
        callbacks?.onDone?.('tool call failed', { finishReason: 'stop' });
        return;
      }

      callbacks?.onDone?.('replacement text', { finishReason: 'stop' });
    },
  });

  const result = await executeStreamingTurn({
    chat,
    chatId,
    assistantMessage,
    messages: [
      { role: 'system', content: 'You are a tutor.' },
      { role: 'user', content: 'Teach me one-step equations.' },
    ],
    controller: new AbortController(),
    turn: {
      auth: buildTransportAuth({
        transport: 'openrouter',
        apiKey: 'test-key',
        useProxy: false,
      }),
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
      caps: {
        canReason: false,
        canSee: false,
        canAudio: false,
        canImageOut: false,
      },
      generation: {},
      searchEnabled: false,
      searchProvider: 'openrouter',
      tutorEnabled: true,
      system: undefined,
    },
    toolDefinition: getTutorToolDefinitions(),
    startBuffered: false,
    userContent: 'Teach me one-step equations.',
    combinedSystem: 'You are a tutor.',
    pipeline,
  });

  assert.equal(streamCallCount, 2, 'should skip final overwrite call after failed tools');
  assert.equal(result.shortCircuited, true);

  const finalMessage = get().messagesById[assistantMessage.id];
  assert.equal(finalMessage?.content, goodDraft);
  assert.ok(!finalMessage?.content.includes('replacement text'));
  assert.equal(persisted[persisted.length - 1]?.content, goodDraft);
});

test('executeStreamingTurn does not preserve incomplete draft when tools fail', async () => {
  const chatId = 'chat-streaming-turn-failed-tool-incomplete-draft';
  const model: ModelDescriptor = {
    id: 'provider/model',
    name: 'Provider Model',
    context_length: 16000,
    pricing: undefined,
    raw: { supported_parameters: ['tools'] },
  };

  const chat: Chat = {
    id: chatId,
    title: 'Tutor chat',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    settings: {
      modelId: model.id,
      generation: {},
      ui: {
        showThinkingByDefault: false,
        showStats: false,
        showToolCallLog: false,
        showDebugRawJson: false,
      },
      features: {
        search: { enabled: false, provider: 'openrouter' },
        tutor: {
          enabled: true,
          defaultModelId: model.id,
          learningPlan: {
            goal: 'Master linear equations',
            generatedAt: Date.now(),
            updatedAt: Date.now(),
            version: 1,
            nodes: [
              {
                id: 'node-1',
                name: 'Solve one-step equations',
                objectives: ['Solve x + a = b'],
                prerequisites: [],
                status: 'in_progress',
              },
            ],
          },
        },
      },
    },
  };

  const assistantMessage = createAssistantMessage({
    id: 'assistant-4',
    chatId,
    content: '',
    model: model.id,
    createdAt: Date.now(),
  });

  const { messagesById, messageIdsByChatId } = buildMessageIndex({
    [chatId]: [assistantMessage],
  });
  const { state, set, get } = createTestStoreState({
    chats: [chat],
    messagesById,
    messageIdsByChatId,
    models: [model],
    modelIndex: createModelIndex([model]),
  });

  const persisted: Message[] = [];
  const incompleteDraft = 'Let me quickly quiz you before we proceed:';
  const finalReply = 'Thanks for waiting. Let us continue with one-step equations now.';

  let streamCallCount = 0;
  const pipeline = createPipelineClient({
    streamChatCompletion: async ({ callbacks }) => {
      streamCallCount += 1;

      if (streamCallCount === 1) {
        callbacks?.onToken?.(incompleteDraft);
        callbacks?.onDone?.(incompleteDraft, {
          finishReason: 'tool_calls',
          toolCalls: [
            {
              id: 'call_1',
              type: 'function',
              function: {
                name: 'quiz',
                arguments: '{"type":"object"}',
              },
            },
          ],
        });
        return;
      }

      if (streamCallCount === 2) {
        callbacks?.onDone?.('tool call failed', { finishReason: 'stop' });
        return;
      }

      callbacks?.onDone?.(finalReply, { finishReason: 'stop' });
    },
  });

  const result = await executeStreamingTurn({
    chat,
    chatId,
    assistantMessage,
    messages: [
      { role: 'system', content: 'You are a tutor.' },
      { role: 'user', content: 'Teach me one-step equations.' },
    ],
    controller: new AbortController(),
    turn: {
      auth: buildTransportAuth({
        transport: 'openrouter',
        apiKey: 'test-key',
        useProxy: false,
      }),
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
      caps: {
        canReason: false,
        canSee: false,
        canAudio: false,
        canImageOut: false,
      },
      generation: {},
      searchEnabled: false,
      searchProvider: 'openrouter',
      tutorEnabled: true,
      system: undefined,
    },
    toolDefinition: getTutorToolDefinitions(),
    startBuffered: false,
    userContent: 'Teach me one-step equations.',
    combinedSystem: 'You are a tutor.',
    pipeline,
  });

  assert.equal(streamCallCount, 3, 'should run final completion call for incomplete draft');
  assert.notEqual(result.shortCircuited, true);

  const finalMessage = get().messagesById[assistantMessage.id];
  assert.equal(finalMessage?.content, finalReply);
  assert.ok(!finalMessage?.content.includes(incompleteDraft));
  assert.equal(persisted[persisted.length - 1]?.content, finalReply);
});

test('executeStreamingTurn omits follow-up user prompt after Anthropic tool results', async () => {
  const chatId = 'chat-streaming-turn-anthropic-tool-results';
  const model: ModelDescriptor = {
    id: 'anthropic-direct/claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    context_length: 200000,
    pricing: undefined,
    raw: { supported_parameters: ['tools'] },
    transport: 'anthropic',
    transportModelId: 'claude-haiku-4-5-20251001',
    providerDisplay: 'Anthropic',
  };

  const chat: Chat = {
    id: chatId,
    title: 'Tutor chat',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    settings: {
      modelId: model.id,
      generation: {},
      ui: {
        showThinkingByDefault: false,
        showStats: false,
        showToolCallLog: false,
        showDebugRawJson: false,
      },
      features: {
        search: { enabled: false, provider: 'openrouter' },
        tutor: {
          enabled: true,
          defaultModelId: model.id,
          learningPlan: {
            goal: 'Master linear equations',
            generatedAt: Date.now(),
            updatedAt: Date.now(),
            version: 1,
            nodes: [
              {
                id: 'node-1',
                name: 'Solve one-step equations',
                objectives: ['Solve x + a = b'],
                prerequisites: [],
                status: 'in_progress',
              },
            ],
          },
        },
      },
    },
  };

  const assistantMessage = createAssistantMessage({
    id: 'assistant-anthropic-1',
    chatId,
    content: '',
    model: model.id,
    createdAt: Date.now(),
  });

  const { messagesById, messageIdsByChatId } = buildMessageIndex({
    [chatId]: [assistantMessage],
  });

  const { state, set, get } = createTestStoreState({
    chats: [chat],
    messagesById,
    messageIdsByChatId,
    models: [model],
    modelIndex: createModelIndex([model]),
  });

  const persisted: Message[] = [];
  const capturedMessageRoles: string[][] = [];
  let streamCallCount = 0;
  const draftedAnswer =
    'You nailed the first step. Keep isolating x, and then check your answer by substitution.';

  const pipeline = createPipelineClient({
    streamChatCompletion: async ({ callbacks, messages }) => {
      streamCallCount += 1;
      capturedMessageRoles.push(messages.map((message) => message.role));

      if (streamCallCount === 1) {
        callbacks?.onToken?.(draftedAnswer);
        callbacks?.onDone?.(draftedAnswer, {
          finishReason: 'tool_calls',
          toolCalls: [
            {
              id: 'call_1',
              type: 'function',
              function: {
                name: 'advance_topic',
                arguments: '{}',
              },
            },
          ],
        });
        return;
      }

      callbacks?.onDone?.('internal follow up', { finishReason: 'stop' });
    },
  });

  const result = await executeStreamingTurn({
    chat,
    chatId,
    assistantMessage,
    messages: [
      { role: 'system', content: 'You are a tutor.' },
      { role: 'user', content: 'Teach me one-step equations.' },
    ],
    controller: new AbortController(),
    turn: {
      auth: buildTransportAuth({
        transport: 'anthropic',
        apiKey: 'test-key',
        useProxy: false,
      }),
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
      caps: {
        canReason: false,
        canSee: false,
        canAudio: false,
        canImageOut: false,
      },
      generation: {},
      searchEnabled: false,
      searchProvider: 'openrouter',
      tutorEnabled: true,
      system: undefined,
    },
    toolDefinition: getTutorToolDefinitions(),
    startBuffered: false,
    userContent: 'Teach me one-step equations.',
    combinedSystem: 'You are a tutor.',
    pipeline,
  });

  assert.equal(streamCallCount, 2, 'Anthropic flow should short-circuit after tool round draft');
  assert.equal(result.shortCircuited, true);
  assert.deepEqual(capturedMessageRoles[1], ['system', 'user', 'assistant', 'tool']);
  assert.equal(get().messagesById[assistantMessage.id]?.content, draftedAnswer);
  assert.equal(persisted[persisted.length - 1]?.content, draftedAnswer);
});
