import { deleteKey, setKey } from '@/lib/keys/store';
import { OPENROUTER_ENDPOINT } from '@/lib/transport/endpoints';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTurn } from '@/lib/agent/planning';
import { applyPlanSideEffects } from '@/lib/agent/planning/sideEffects';
import { regenerate } from '@/lib/agent/regenerate';
import { createPipelineClient } from '@/lib/agent/pipelineClient';
import { createModelIndex } from '@/lib/models';
import type { Message, Chat, ModelDescriptor } from '@/lib/types';
import { getSearchToolDefinition } from '@/lib/search';
import type { StoreSetter, TurnContext } from '@/lib/agent/types';
import { mockFetch } from '../../../tests/helpers/mockFetch';
import { resolveTurnSettings } from '@/lib/settings/resolve';
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

const searchTools = getSearchToolDefinition();

const mergeState = (target: any, patch: any) => {
  if (!patch) return;
  Object.entries(patch).forEach(([key, value]) => {
    target[key] = value;
  });
};

test('planTurn runs search tools and updates Tavily UI state', async () => {
  // Tool-based search only runs when its provider is keyed; without one the
  // turn would (correctly) fall back to provider-native search.
  await setKey('tavily', 'tvly-test');
  const chat: Chat = {
    id: 'chat-1',
    title: 'Test Chat',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    folderId: undefined,
    settings: {
      modelId: 'provider/model',
      system: 'You are helpful.',
      generation: {
        temperature: 0.2,
        topP: 0.9,
        maxTokens: 256,
        reasoningEffort: 'none',
        reasoningTokens: 0,
      },
      ui: {
        showThinkingByDefault: false,
        showStats: false,
        showToolCallLog: false,
        showDebugRawJson: true,
      },
      features: {
        search: { enabled: true, provider: 'tavily' },
        tutor: {
          enabled: true,
          defaultModelId: 'provider/model',
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
      },
    },
  };
  const assistantMessage: Message = {
    id: 'assistant-1',
    chatId: chat.id,
    role: 'assistant',
    content: '',
    createdAt: Date.now(),
    model: chat.settings.modelId,
    reasoning: '',
    attachments: [],
  };

  const { messagesById, messageIdsByChatId } = buildMessageIndex({
    [chat.id]: [assistantMessage],
  });

  const state: any = {
    chats: [chat],
    messagesById,
    messageIdsByChatId,
    models: baseModels,
    modelIndex: createModelIndex(baseModels),
    ui: {
      notice: undefined,
      routePreference: 'speed',
      activeTurnByChatId: {},
      flags: {
        experimentalTutor: true,
      },
      debug: {
        mode: false,
        byMessageId: {},
        autoReasoningModelIds: {},
      },
      search: { tavilyByMessageId: {} },
      tutor: { forceMode: false },
    },
    setSearchStatus: (messageId: string, entry: any) => {
      state.ui.search.tavilyByMessageId[messageId] = entry;
    },
    setNotice: (notice?: string) => {
      state.ui.notice = notice;
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

  const pipeline = createPipelineClient({
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
                  arguments: JSON.stringify({ query: 'tavily query', count: 3 }),
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
    auth: buildTransportAuth({ endpoint: OPENROUTER_ENDPOINT, apiKey: 'test' }),
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
    modelId: chat.settings.modelId,
  });

  const planOutput = await planTurn({
    chat,
    chatId: chat.id,
    assistantMessage,
    userContent: 'Who are you?',
    combinedSystem: undefined,
    baseMessages: [
      { role: 'system', content: 'Be concise.' },
      { role: 'user', content: 'Hello' },
    ],
    toolDefinition: searchTools,
    controller: new AbortController(),
    turn: turnContext,
    settings,
    pipeline,
  });
  applyPlanSideEffects({ sideEffects: planOutput.sideEffects, set });

  const tavilyEntry = state.ui.search.tavilyByMessageId[assistantMessage.id];
  assert.ok(tavilyEntry);
  assert.equal(tavilyEntry.status, 'done');
  assert.equal(tavilyEntry.query, 'tavily query');
  assert.ok(Array.isArray(tavilyEntry.results) && tavilyEntry.results.length === 1);
  const toolLog = state.messagesById[assistantMessage.id]?.toolCalls;
  assert.ok(Array.isArray(toolLog) && toolLog.length >= 1);
  const searchEntries = toolLog.filter((entry: any) => entry?.name === 'web_search');
  assert.ok(searchEntries.length >= 1);
  assert.equal(searchEntries[0]?.category, 'search');
  assert.equal(searchEntries[0]?.metadata?.provider, 'tavily');
  assert.equal(searchEntries[0]?.metadata?.round, 1);
  assert.equal(searchEntries[0]?.metadata?.results, 1);

  restoreFetch();
  await deleteKey('tavily');
});

/** A regenerate over a real store holding one question and the reply being redone. */
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
