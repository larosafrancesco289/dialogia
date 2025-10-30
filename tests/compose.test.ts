import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { composeTurn } from '@/lib/agent/compose';
import { ProviderSort } from '@/lib/models/providerSort';
import type { Chat, Message, Attachment } from '@/lib/types';
import type { ModelIndex } from '@/lib/models';
import tutorProfileService from '@/lib/tutorProfile';

const baseChat = (): Chat => ({
  id: 'chat-1',
  title: 'Algebra session',
  createdAt: Date.now() - 1000,
  updatedAt: Date.now() - 500,
  settings: {
    model: 'provider/model-alpha',
    system: 'Always respond enthusiastically.',
    search_enabled: true,
    search_provider: 'brave',
    tutor_mode: true,
    tutor_default_model: 'provider/model-alpha',
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
  const loadProfile = mock.method(tutorProfileService, 'loadTutorProfile', async () => ({ id: 'profile-1' }));
  const summarizeProfile = mock.method(
    tutorProfileService,
    'summarizeTutorProfile',
    () => 'Prefers visuals',
  );

  const chat = baseChat();
  const ui = {
    experimentalTutor: true,
    forceTutorMode: false,
    experimentalBrave: true,
    routePreference: 'speed',
    nextTutorNudge: 'more_practice',
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

  const result = await composeTurn({
    chat,
    ui,
    modelIndex: modelIndexStub,
    prior,
    newUser: { content: 'Here are my notes.', attachments },
    attachments,
  });

  assert.equal(result.tutor.enabled, true);
  assert.equal(result.search.provider, 'brave');
  assert.equal(result.search.enabled, true);
  assert.equal(result.hasPdf, true);
  assert.equal(result.shouldPlan, true);
  assert.equal(result.providerSort, ProviderSort.Throughput);
  assert.equal(result.consumedTutorNudge, 'more_practice');
  assert.ok(result.system && result.system.includes('Learner Profile:'));
  assert.ok(result.system && result.system.includes('Always respond enthusiastically.'));
  assert.ok(result.system && result.system.includes('LEARNING PLAN CONTEXT'));
  assert.ok(result.system && result.system.includes('CURRENT FOCUS: Linear Equations'));

  assert.ok(result.plugins && result.plugins.some((plugin) => plugin.id === 'file-parser'));
  const toolNames = (result.tools || []).map((tool) => tool.function.name);
  assert.ok(toolNames.includes('web_search'), 'expected web_search tool');
  assert.ok(toolNames.length > 1, 'expected tutor tools to be included');

  loadProfile.mock.restore();
  summarizeProfile.mock.restore();
});

test('composeTurn falls back to OpenRouter search when Brave experiment disabled', async () => {
  const chat = baseChat();
  chat.settings.search_provider = 'brave';
  const result = await composeTurn({
    chat,
    ui: {
      experimentalBrave: false,
      experimentalTutor: false,
      forceTutorMode: false,
      routePreference: 'speed',
    } as any,
    modelIndex: modelIndexStub,
    prior: [],
    newUser: { content: 'Hello' },
    attachments: [],
  });

  assert.equal(result.search.provider, 'openrouter');
});
