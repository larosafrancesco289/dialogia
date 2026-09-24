import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeTurn } from '@/lib/agent/compose';
import { createStore } from 'zustand/vanilla';
import type { StateCreator } from 'zustand';
import type { Chat, Message, PersistedAttachment } from '@/lib/types';
import type { ModelIndex } from '@/lib/models';
import { buildStoreInitializer } from '@/lib/store/createStore';
import type { StoreState } from '@/lib/store/types';
import { TUTOR_SYSTEM_PROMPT } from '@/modules/tutor/agent/systemPrompt';
import { resolveTurnSettings } from '@/lib/settings/resolve';
import { deleteKey, setKey } from '@/lib/keys/store';

const baseChat = (): Chat => ({
  id: 'chat-1',
  title: 'Algebra session',
  createdAt: Date.now() - 1000,
  updatedAt: Date.now() - 500,
  settings: {
    modelId: 'provider/model-alpha',
    system: 'Always respond enthusiastically.',
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
        defaultModelId: 'provider/model-alpha',
        learningPlan: {
          goal: 'Master algebra fundamentals',
          generatedAt: Date.now() - 10,
          updatedAt: Date.now() - 10,
          version: 1,
          nodes: [
            {
              id: 'linear-equations',
              name: 'Linear Equations',
              description: 'Solve and graph linear equations and inequalities.',
              objectives: ['Solve linear equations', 'Interpret slope and intercept'],
              prerequisites: [],
              status: 'in_progress',
              estimatedMinutes: 45,
            },
            {
              id: 'systems',
              name: 'Systems of Equations',
              description: 'Solve systems using substitution and elimination.',
              objectives: ['Solve systems by substitution', 'Solve systems by elimination'],
              prerequisites: ['linear-equations'],
              status: 'not_started',
              estimatedMinutes: 60,
            },
          ],
        },
        planGenerated: true,
        enableLearnerModel: true,
      },
    },
  },
});

const modelIndexStub: ModelIndex = {
  all: [
    {
      id: 'provider/model-alpha',
      name: 'Model Alpha',
      context_length: 8000,
      pricing: { prompt: 1, completion: 1, currency: 'usd' },
    },
  ],
  byId: new Map([
    [
      'provider/model-alpha',
      {
        id: 'provider/model-alpha',
        name: 'Model Alpha',
        context_length: 8000,
        pricing: { prompt: 1, completion: 1, currency: 'usd' },
      },
    ],
  ]),
  get: () => undefined,
  caps: () => ({ canReason: false, canSee: false, canAudio: false, canImageOut: false }),
  label: () => 'Model Alpha',
};

test('composeTurn merges tutor and search context with plugins and tools', async () => {
  await setKey('tavily', 'tvly-test');
  const chat = baseChat();
  const store = createStore<StoreState>(
    buildStoreInitializer() as unknown as StateCreator<StoreState>,
  );
  store.setState({ chats: [chat] });
  const ui = {
    flags: { experimentalTutor: true },
    tutor: { forceMode: false },
    routePreference: 'speed',
  } as any;
  const prior: Message[] = [
    {
      id: 'msg-user-1',
      chatId: chat.id,
      role: 'user',
      content: 'Can we revisit slope-intercept form?',
      createdAt: Date.now() - 200,
    },
  ];
  const attachments: PersistedAttachment[] = [
    {
      id: 'att-1',
      kind: 'pdf',
      mime: 'application/pdf',
      dataURL: 'data:application/pdf;base64,AAA',
      name: 'notes.pdf',
    },
  ];

  try {
    const settings = resolveTurnSettings({
      chat,
      ui,
      modelIndex: modelIndexStub,
      modelId: chat.settings.modelId,
    });
    const result = await composeTurn({
      chat,
      ui,
      settings,
      modelIndex: modelIndexStub,
      prior,
      newUser: { content: 'Here are my notes.', attachments },
      attachments,
      store: { get: store.getState, set: store.setState },
    });

    assert.equal(result.settings.tutorEnabled, true);
    assert.equal(result.settings.searchProvider, 'tavily');
    assert.equal(result.settings.searchEnabled, true);
    assert.equal(result.hasPdf, true);
    assert.equal(result.shouldPlan, true);
    assert.equal(result.loop, 'agent');
    assert.equal(result.settings.generation.providerSort, undefined);
    // The tutor prompt replaces the chat's base system prompt.
    assert.ok(result.systemStable?.includes(TUTOR_SYSTEM_PROMPT));
    assert.ok(!result.system?.includes('Always respond enthusiastically.'));
    // The chat's legacy plan was imported, and the state block reads from it.
    assert.ok(result.systemDynamic?.startsWith('Tutor state'));
    assert.ok(result.systemDynamic?.includes('Current topic: Linear Equations [linear-equations]'));
    assert.equal(
      result.messagePatch?.tutorSeq,
      store.getState().tutorSessions[chat.id].state.lastSeq,
    );

    assert.ok(result.plugins && result.plugins.some((plugin) => plugin.id === 'file-parser'));
    const toolNames = (result.tools || []).map((tool) => tool.function.name);
    assert.ok(toolNames.includes('web_search'), 'expected web_search tool');
    assert.ok(toolNames.includes('give_quiz'), 'expected the teaching tools');
    assert.ok(!toolNames.includes('ask_intake'), 'no intake once a plan exists');
  } finally {
    await deleteKey('tavily');
  }
});

test('composeTurn uses tool-based search when the provider has a key', async () => {
  await setKey('tavily', 'tvly-test');
  const chat = baseChat();
  chat.settings.features.search.provider = 'tavily';
  const ui = {
    flags: { experimentalTutor: false },
    tutor: { forceMode: false },
    routePreference: 'speed',
  } as any;
  const settings = resolveTurnSettings({
    chat,
    ui,
    modelIndex: modelIndexStub,
    modelId: chat.settings.modelId,
  });
  const result = await composeTurn({
    chat,
    ui,
    settings,
    modelIndex: modelIndexStub,
    prior: [],
    newUser: { content: 'Hello' },
    attachments: [],
  });

  assert.equal(result.settings.searchProvider, 'tavily');
  assert.equal(result.tools?.[0]?.function.name, 'web_search');
  assert.equal(result.tools?.[1]?.function.name, 'web_fetch');
  await deleteKey('tavily');
});

test('composeTurn degrades to native search when the provider has no key', async () => {
  const chat = baseChat();
  chat.settings.features.search.provider = 'tavily';
  const ui = {
    flags: { experimentalTutor: false },
    tutor: { forceMode: false },
    routePreference: 'speed',
  } as any;
  const settings = resolveTurnSettings({
    chat,
    ui,
    modelIndex: modelIndexStub,
    modelId: chat.settings.modelId,
  });
  const result = await composeTurn({
    chat,
    ui,
    settings,
    modelIndex: modelIndexStub,
    prior: [],
    newUser: { content: 'Hello' },
    attachments: [],
  });

  assert.equal(result.settings.searchProvider, 'openrouter');
  assert.ok(result.plugins?.some((plugin) => plugin.id === 'web'));
  assert.ok(!(result.tools || []).some((tool) => tool.function.name === 'web_search'));
  assert.equal(result.shouldPlan, false);
});
