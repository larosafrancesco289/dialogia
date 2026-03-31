import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initializeLearnerModel } from '@/lib/agent/learner-model';
import type { LearnerModel, LearningPlan } from '@/lib/types';
import type { HeadlessTutorSession } from '@/tooling/headless/session';
import { executeStudentToolCalls, getStudentToolDefinitions } from './studentTools';

type TutorPatch = {
  features?: {
    tutor?: {
      learningPlan?: LearningPlan;
      learnerModel?: LearnerModel;
    };
  };
};

type MinimalChat = {
  id: string;
  settings: {
    features: {
      tutor: {
        learningPlan?: LearningPlan;
        learnerModel?: LearnerModel;
      };
    };
  };
};

type MinimalState = {
  chats: MinimalChat[];
  updateChatSettings: (patch: TutorPatch) => Promise<void>;
};

function createPlan(): LearningPlan {
  const now = Date.now();
  return {
    goal: 'Understand derivatives',
    generatedAt: now,
    updatedAt: now,
    version: 1,
    nodes: [
      {
        id: 'power_rule',
        name: 'Power Rule',
        objectives: ['Apply power rule'],
        prerequisites: [],
        status: 'in_progress',
      },
      {
        id: 'chain_rule',
        name: 'Chain Rule',
        objectives: ['Apply chain rule'],
        prerequisites: ['power_rule'],
        status: 'not_started',
      },
    ],
  };
}

function createMockSession(
  chatId: string,
  plan: LearningPlan,
  learnerModel: LearnerModel,
): { session: HeadlessTutorSession; state: MinimalState } {
  const chat: MinimalChat = {
    id: chatId,
    settings: {
      features: {
        tutor: {
          learningPlan: plan,
          learnerModel,
        },
      },
    },
  };

  const state: MinimalState = {
    chats: [chat],
    async updateChatSettings(patch: TutorPatch) {
      const tutorPatch = patch.features?.tutor;
      if (!tutorPatch) return;
      chat.settings.features.tutor = {
        ...chat.settings.features.tutor,
        ...tutorPatch,
      };
    },
  };

  const session = {
    getState: () => state,
    getMessages: () => [],
  } as unknown as HeadlessTutorSession;

  return { session, state };
}

test('getStudentToolDefinitions excludes plan-mutating tools when plan is not editable', () => {
  const allTools = getStudentToolDefinitions();
  const modelOnlyTools = getStudentToolDefinitions({ planEditable: false });

  assert.equal(
    allTools.some((tool) => tool.function.name === 'mark_topic_known'),
    true,
  );
  assert.equal(
    modelOnlyTools.some((tool) => tool.function.name === 'mark_topic_known'),
    false,
  );
});

test('executeStudentToolCalls skips mark_topic_known when plan editability is disabled', async () => {
  const results = await executeStudentToolCalls({
    session: {} as HeadlessTutorSession,
    chatId: 'chat_1',
    turn: 2,
    calls: [{ id: 'c1', name: 'mark_topic_known', args: { nodeId: 'power_rule' } }],
    learnerModelEditable: true,
    planEditable: false,
  });

  assert.equal(results.length, 1);
  assert.equal(results[0]?.status, 'skipped');
  assert.match(results[0]?.error ?? '', /Plan editability is disabled/i);
});

test('mark_topic_known applies a floor without reducing existing confidence', async () => {
  const plan = createPlan();
  const learnerModel = initializeLearnerModel('chat_1', plan);
  learnerModel.mastery.power_rule.confidence = 0.95;

  const { session, state } = createMockSession('chat_1', plan, learnerModel);
  const results = await executeStudentToolCalls({
    session,
    chatId: 'chat_1',
    turn: 2,
    calls: [{ id: 'c1', name: 'mark_topic_known', args: { nodeId: 'power_rule' } }],
    learnerModelEditable: true,
    planEditable: true,
  });

  assert.equal(results.length, 1);
  assert.equal(results[0]?.status, 'success');

  const updatedTutor = state.chats[0]?.settings.features.tutor;
  const updatedConfidence = updatedTutor?.learnerModel?.mastery?.power_rule?.confidence;
  assert.equal(typeof updatedConfidence, 'number');
  assert.equal(updatedConfidence, 0.95);
});
