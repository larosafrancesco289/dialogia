import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTurn } from '@/lib/agent/planning';
import { regenerate } from '@/lib/agent/regenerate';
import { setOpenRouterMocksForTests as __setOpenRouterMocksForTests } from '@/lib/agent/pipelineClient';
import { createModelIndex } from '@/lib/models';
import type { Message, Chat, ModelDescriptor, ModelTransport } from '@/lib/types';
import { getTutorToolDefinitions } from '@/lib/agent/tutor';
import { getSearchToolDefinition } from '@/lib/agent/searchFlow';
import type { StoreSetter, TurnContext } from '@/lib/agent/types';
import { mockFetch } from '../../../tests/helpers/mockFetch';
import { resolveTurnSettings } from '@/lib/settings/resolve';
import { ProviderSort } from '@/lib/models/providerSort';

const baseModels: ModelDescriptor[] = [
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
      learningPlan: {
        goal: 'Test mastery',
        generatedAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        nodes: [
          {
            id: 'node-1',
            name: 'Algebra basics',
            objectives: ['Solve linear equations'],
            prerequisites: [],
            status: 'in_progress',
          },
        ],
      },
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
      routePreference: 'speed',
      flags: {
        experimentalTutor: true,
        experimentalBrave: true,
      },
      debug: {
        mode: false,
        byMessageId: {},
        autoReasoningModelIds: {},
        learnerModelDebugByMessageId: {},
      },
      search: { braveByMessageId: {} },
      tutor: { byMessageId: {}, forceMode: false },
    },
    setSearchStatus: (messageId: string, entry: any) => {
      state.ui.search.braveByMessageId[messageId] = entry;
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

  const restoreFetch = mockFetch((async () => ({
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
  })) as any);

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
              {
                id: 'call_2',
                type: 'function',
                function: {
                  name: 'quiz_fill_blank',
                  arguments: JSON.stringify({
                    title: 'Extra',
                    items: [
                      {
                        id: 'blank1',
                        prompt: '1 + 1 = ____',
                        answer: '2',
                      },
                    ],
                  }),
                },
              },
              {
                id: 'call_3',
                type: 'function',
                function: {
                  name: 'assess_answer',
                  arguments: JSON.stringify({
                    nodeId: 'node-1',
                    interaction: {
                      question: 'Q?',
                      studentAnswer: 'A',
                      correct: true,
                    },
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

  const modelIndex = createModelIndex(baseModels);
  const persistMessage = async (message: Message) => {
    savedMessages.push(message);
  };
  const turnContext = {
    apiKey: 'test',
    transport: 'openrouter' as ModelTransport,
    set,
    get,
    models: baseModels,
    modelIndex,
    persistMessage,
  } satisfies TurnContext;

  const settings = resolveTurnSettings({
    chat,
    ui: state.ui,
    modelIndex,
    modelId: chat.settings.model,
  });

  await planTurn({
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
    controller: new AbortController(),
    turn: turnContext,
    settings,
  });

  const braveEntry = state.ui.search.braveByMessageId[assistantMessage.id];
  assert.ok(braveEntry);
  assert.equal(braveEntry.status, 'done');
  assert.equal(braveEntry.query, 'brave query');
  assert.ok(Array.isArray(braveEntry.results) && braveEntry.results.length === 1);
  const savedTutor = savedMessages.find((msg) => Array.isArray((msg as any)?.tutor?.mcq))
    ?.tutor as any;
  assert.ok(Array.isArray(savedTutor?.mcq) && savedTutor.mcq.length === 1);
  assert.equal(Array.isArray(savedTutor?.fillBlank), false);
  const toolLog = state.messages[chat.id][0]?.toolCalls;
  assert.ok(Array.isArray(toolLog) && toolLog.length >= 2);
  const searchEntries = toolLog.filter((entry: any) => entry?.name === 'web_search');
  const tutorEntries = toolLog.filter((entry: any) => entry?.name === 'quiz_mcq');
  const skippedFill = toolLog.filter((entry: any) => entry?.name === 'quiz_fill_blank');
  const assessEntries = toolLog.filter((entry: any) => entry?.name === 'assess_answer');
  assert.ok(searchEntries.length >= 1);
  assert.ok(tutorEntries.length >= 1);
  assert.equal(skippedFill.length, 0);
  assert.ok(assessEntries.length >= 1);
  assert.equal(searchEntries[0]?.category, 'search');
  assert.equal(searchEntries[0]?.metadata?.provider, 'brave');
  assert.equal(searchEntries[0]?.metadata?.round, 1);
  assert.equal(searchEntries[0]?.metadata?.results, 1);
  assert.equal(tutorEntries[0]?.category, 'tutor');
  assert.equal(tutorEntries[0]?.metadata?.round, 1);
  assert.equal(tutorEntries[0]?.metadata?.usedContent, true);

  __setOpenRouterMocksForTests();
  restoreFetch();
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
      routePreference: 'speed',
      flags: {
        experimentalTutor: false,
        experimentalBrave: false,
      },
      debug: {
        mode: true,
        byMessageId: {},
        autoReasoningModelIds: {},
        learnerModelDebugByMessageId: {},
      },
      search: { braveByMessageId: {} },
      tutor: { byMessageId: {}, forceMode: false },
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

  const modelIndexReg = createModelIndex(baseModels);
  const persistRegenerateMessage = async (message: Message) => {
    saved.push(message);
  };
  const regenerateTurn = {
    apiKey: 'test',
    transport: 'openrouter' as ModelTransport,
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
    messages: state.messages[chat.id],
    turn: regenerateTurn,
    controller: new AbortController(),
  });

  const updatedMessage = state.messages[chat.id][1];
  assert.equal(updatedMessage.content, 'Hello');
  assert.equal(updatedMessage.genSettings.providerSort, ProviderSort.Price);
  assert.equal(updatedMessage.genSettings.search_enabled, true);
  const debugEntry = state.ui.debug.byMessageId[assistantMessage.id];
  assert.ok(debugEntry);
  const parsed = JSON.parse(debugEntry.body);
  assert.equal(parsed.model, 'provider/model');
  assert.equal(state.ui.isStreaming, false);
  assert.equal(saved.length > 0, true);

  __setOpenRouterMocksForTests();
});
