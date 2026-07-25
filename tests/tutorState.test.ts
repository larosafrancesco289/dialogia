import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTutorPhase, allowedTutorToolsForPhase } from '@/modules/tutor/agent/state';
import type { Chat, LearningPlan, Message } from '@/lib/types';

const baseSettings = (): Chat['settings'] => ({
  modelId: 'test-model',
  generation: {},
  ui: {
    showThinkingByDefault: false,
    showStats: false,
    showToolCallLog: false,
    showDebugRawJson: true,
  },
  features: {
    search: { enabled: false, provider: 'openrouter' },
    tutor: { enabled: true },
  },
});

test('getTutorPhase returns intake when no plan and questionnaire pending', () => {
  const chat: Chat = {
    id: 'chat-1',
    title: 'Test chat',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    settings: baseSettings(),
  };
  const messages = [
    {
      id: 'a-1',
      chatId: chat.id,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      tutor: {
        questionnaire: {
          status: 'awaiting',
          questions: [],
        },
      },
    },
  ] as Message[];

  const phase = getTutorPhase(chat, messages);
  assert.equal(phase, 'intake');
  const allowed = allowedTutorToolsForPhase(phase);
  assert.ok(allowed.includes('ask_student_question'));
  assert.ok(allowed.includes('learning_plan'));
  assert.ok(allowed.includes('create_diagnostic'));
});

test('getTutorPhase returns practice when plan active and practice widget present', () => {
  const plan: LearningPlan = {
    goal: 'Practice algebra',
    generatedAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
    nodes: [
      {
        id: 'n1',
        name: 'Linear equations',
        objectives: ['Solve for x'],
        prerequisites: [],
        status: 'in_progress',
      },
    ],
  };
  const chat: Chat = {
    id: 'chat-2',
    title: 'Practice chat',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    settings: {
      ...baseSettings(),
      features: {
        ...baseSettings().features,
        tutor: {
          ...baseSettings().features.tutor,
          learningPlan: plan,
        },
      },
    },
  };

  const messages = [
    {
      id: 'a-2',
      chatId: chat.id,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      tutor: {
        mcq: [{ id: 'q1', question: '1+1?', choices: ['1', '2'], correct: 1 }],
      },
    },
  ] as Message[];

  const phase = getTutorPhase(chat, messages);
  assert.equal(phase, 'practice');
  const allowed = allowedTutorToolsForPhase(phase);
  assert.ok(allowed.includes('quiz'));
  assert.ok(allowed.includes('record_learning'));
  assert.ok(allowed.includes('learning_plan')); // learning_plan is now available in practice phase for updates
});

test('allowUpdatePlan false blocks learning_plan once a plan exists', () => {
  const allowed = allowedTutorToolsForPhase('teaching', {
    allowLearnerModel: true,
    allowUpdatePlan: false,
    planExists: true,
  });
  assert.equal(allowed.includes('learning_plan'), false);
});

test('allowLearnerModel false blocks the learner-model tools', () => {
  const allowed = allowedTutorToolsForPhase('teaching', { allowLearnerModel: false });
  assert.equal(allowed.includes('record_learning'), false);
});
