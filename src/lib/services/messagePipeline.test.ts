import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTurn, regenerate, __setOpenRouterMocksForTests } from '@/lib/services/messagePipeline';
import { createModelIndex } from '@/lib/models';
import type { Message, Chat, ORModel } from '@/lib/types';
import { getTutorToolDefinitions } from '@/lib/agent/tutor';
import { getSearchToolDefinition } from '@/lib/agent/searchFlow';
import type { StoreSetter } from '@/lib/agent/types';
import { ProviderSort } from '@/lib/models/providerSort';

const baseModels: ORModel[] = [
  {
    id: 'provider/model',
    name: 'Provider Model',
    context_length: 16000,
    pricing: undefined,
    raw: {},
  },
];

const tutorTools = getTutorToolDefinitions();
const searchTools = getSearchToolDefinition();

const mergeState = (target: any, patch: any) => {
  if (!patch) return;
  Object.entries(patch).forEach(([key, value]) => {
    target[key] = value;
  });
};

test('planTurn applies tutor tools and updates Brave UI state', async () => {
  const chat: Chat = {
    id: 'chat-1',
    title: 'Test Chat',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    folderId: undefined,
    settings: {
      model: 'provider/model',
      system: 'You are helpful.',
      show_thinking_by_default: false,
      show_stats: false,
      search_enabled: true,
      search_provider: 'brave',
      reasoning_effort: 'none',
      reasoning_tokens: 0,
      temperature: 0.2,
      top_p: 0.9,
      max_tokens: 256,
      tutor_mode: true,
      tutor_default_model: 'provider/model',
    },
  };
  const assistantMessage: Message = {
    id: 'assistant-1',
    chatId: chat.id,
    role: 'assistant',
    content: '',
    createdAt: Date.now(),
    model: chat.settings.model,
    reasoning: '',
    attachments: [],
  };

  const state: any = {
    chats: [chat],
    messages: {
      [chat.id]: [assistantMessage],
    },
    models: baseModels,
    modelIndex: createModelIndex(baseModels),
    ui: {
      notice: undefined,
      debugMode: false,
      debugByMessageId: {},
      tutorByMessageId: {},
      braveByMessageId: {},
      experimentalTutor: true,
      experimentalBrave: true,
      forceTutorMode: false,
      autoReasoningModelIds: {},
      routePreference: 'speed',
    },
  };

  const savedMessages: Message[] = [];
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

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      results: [
        {
          title: 'Result',
          url: 'https://example.com',
          description: 'Example',
        },
      ],
    }),
  })) as any;

  __setOpenRouterMocksForTests({
    chatCompletion: async () => ({
      id: 'plan-turn-1',
      object: 'chat.completion',
      created: Date.now(),
      model: 'provider/model',
      usage: { prompt_tokens: 10 },
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_0',
                type: 'function',
                function: {
                  name: 'web_search',
                  arguments: JSON.stringify({ query: 'brave query', count: 3 }),
                },
              },
              {
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'quiz_mcq',
                  arguments: JSON.stringify({
                    title: 'Quiz',
                    items: [
                      {
                        id: 'item1',
                        question: 'Q?',
                        choices: ['A'],
                        correct: 0,
                      },
                    ],
                  }),
                },
              },
            ],
          },
        },
      ],
    }),
    streamChatCompletion: undefined,
  });

  const result = await planTurn({
    chat,
    chatId: chat.id,
    assistantMessage,
    userContent: 'Who are you?',
    combinedSystem: undefined,
    baseMessages: [
      { role: 'system', content: 'Be concise.' },
      { role: 'user', content: 'Hello' },
    ],
    toolDefinition: [...searchTools, ...tutorTools],
    searchEnabled: true,
    searchProvider: 'brave',
    providerSort: ProviderSort.Throughput,
    apiKey: 'test',
    transport: 'openrouter',
    controller: new AbortController(),
    set,
    get,
    models: baseModels,
    modelIndex: createModelIndex(baseModels),
    persistMessage: async (message) => {
      savedMessages.push(message);
    },
  });

  const braveEntry = state.ui.braveByMessageId[assistantMessage.id];
  assert.ok(braveEntry);
  assert.equal(braveEntry.status, 'done');
  assert.equal(braveEntry.query, 'brave query');
  assert.ok(Array.isArray(braveEntry.results) && braveEntry.results.length === 1);
  const savedTutor = savedMessages.find((msg) => Array.isArray((msg as any)?.tutor?.mcq))
    ?.tutor as any;
  assert.ok(Array.isArray(savedTutor?.mcq) && savedTutor.mcq.length === 1);

  __setOpenRouterMocksForTests();
  globalThis.fetch = originalFetch;
});

test('regenerate reuses snapshots and records debug payload', async () => {
  const chat: Chat = {
    id: 'chat-regen',
    title: 'Regen Chat',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    folderId: undefined,
    settings: {
      model: 'provider/model',
      system: 'Be formal.',
      show_thinking_by_default: false,
      show_stats: false,
      search_enabled: false,
      search_provider: 'openrouter',
      reasoning_effort: 'low',
      reasoning_tokens: 256,
      temperature: 0.1,
      top_p: 0.8,
      max_tokens: 200,
      tutor_mode: false,
      tutor_default_model: 'provider/model',
    },
  };
  const assistantMessage: Message = {
    id: 'assistant-regen',
    chatId: chat.id,
    role: 'assistant',
    content: 'Old content',
    createdAt: Date.now(),
    model: chat.settings.model,
    reasoning: '',
    attachments: [],
    systemSnapshot: 'Snapshot system',
    genSettings: {
      temperature: 0.3,
      top_p: 0.7,
      max_tokens: 150,
      providerSort: ProviderSort.Price,
      search_enabled: true,
      search_provider: 'openrouter',
    },
  };
  const userMessage: Message = {
    id: 'user-regen',
    chatId: chat.id,
    role: 'user',
    content: 'Question',
    createdAt: Date.now() - 10,
  } as Message;

  const state: any = {
    chats: [chat],
    messages: {
      [chat.id]: [userMessage, assistantMessage],
    },
    models: baseModels,
    modelIndex: createModelIndex(baseModels),
    ui: {
      notice: undefined,
      debugMode: true,
      debugByMessageId: {},
      tutorByMessageId: {},
      braveByMessageId: {},
      experimentalTutor: false,
      experimentalBrave: false,
      forceTutorMode: false,
      autoReasoningModelIds: {},
      routePreference: 'speed',
      isStreaming: false,
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

  __setOpenRouterMocksForTests({
    streamChatCompletion: async ({ callbacks }) => {
      callbacks?.onStart?.();
      callbacks?.onToken?.('Hello');
      callbacks?.onDone?.('Hello', { usage: { prompt_tokens: 5 } });
    },
  });

  await regenerate({
    chat,
    chatId: chat.id,
    targetMessageId: assistantMessage.id,
    messages: state.messages[chat.id],
    models: baseModels,
    modelIndex: createModelIndex(baseModels),
    apiKey: 'test',
    transport: 'openrouter',
    controller: new AbortController(),
    set,
    get,
    persistMessage: async (message) => {
      saved.push(message);
    },
  });

  const updatedMessage = state.messages[chat.id][1];
  assert.equal(updatedMessage.content, 'Hello');
  assert.equal(updatedMessage.genSettings.providerSort, ProviderSort.Price);
  assert.equal(updatedMessage.genSettings.search_enabled, true);
  const debugEntry = state.ui.debugByMessageId[assistantMessage.id];
  assert.ok(debugEntry);
  const parsed = JSON.parse(debugEntry.body);
  assert.equal(parsed.model, 'provider/model');
  assert.equal(state.ui.isStreaming, false);
  assert.equal(saved.length > 0, true);

  __setOpenRouterMocksForTests();
});
