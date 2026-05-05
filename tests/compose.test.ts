import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeTurn } from '@/lib/agent/compose';
import { ProviderSort } from '@/lib/models/providerSort';
import type { Chat, Message, Attachment, TutorProfile } from '@/lib/types';
import type { ModelIndex } from '@/lib/models';
import tutorProfileService from '@/lib/tutor/profile';
import { resolveTurnSettings } from '@/lib/settings/resolve';

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
  const profileStub: TutorProfile = {
    chatId: 'chat-1',
    updatedAt: Date.now(),
    totalAnswered: 0,
    totalCorrect: 0,
    topics: {},
    skills: {},
    difficulty: {
      easy: { correct: 0, wrong: 0 },
      medium: { correct: 0, wrong: 0 },
      hard: { correct: 0, wrong: 0 },
    },
  };

  const originalLoadProfile = tutorProfileService.loadTutorProfile;
  const originalSummarizeProfile = tutorProfileService.summarizeTutorProfile;

  tutorProfileService.loadTutorProfile = async () => profileStub;
  tutorProfileService.summarizeTutorProfile = () => 'Prefers visuals';

  const chat = baseChat();
  const ui = {
    flags: { experimentalTutor: true },
    tutor: { forceMode: false },
    routePreference: 'speed',
    overrides: { tutorNudge: 'more_practice' },
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
  const attachments: Attachment[] = [
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
    });

    assert.equal(result.settings.tutorEnabled, true);
    assert.equal(result.settings.searchProvider, 'tavily');
    assert.equal(result.settings.searchEnabled, true);
    assert.equal(result.hasPdf, true);
    assert.equal(result.shouldPlan, true);
    assert.equal(result.settings.generation.providerSort, undefined);
    assert.equal(result.consumedTutorNudge, 'more_practice');
    assert.ok(result.system && result.system.includes('Learner Profile:'));
    // When tutor is enabled, the base system prompt should NOT be included
    assert.ok(!result.system?.includes('Always respond enthusiastically.'));
    assert.ok(result.system && result.system.includes('LEARNING PLAN CONTEXT'));
    assert.ok(result.system && result.system.includes('CURRENT FOCUS: Linear Equations'));

    assert.ok(result.plugins && result.plugins.some((plugin) => plugin.id === 'file-parser'));
    const toolNames = (result.tools || []).map((tool) => tool.function.name);
    assert.ok(toolNames.includes('web_search'), 'expected web_search tool');
    assert.ok(toolNames.length > 1, 'expected tutor tools to be included');
  } finally {
    tutorProfileService.loadTutorProfile = originalLoadProfile;
    tutorProfileService.summarizeTutorProfile = originalSummarizeProfile;
  }
});

test('composeTurn uses Tavily search when configured', async () => {
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
});
