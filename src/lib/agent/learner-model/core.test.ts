import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LearningPlan } from '@/lib/types';
import { applyLearnerModelFeedback, initializeLearnerModel } from '@/lib/agent/learner-model/core';

function createPlan(): LearningPlan {
  return {
    goal: 'Test plan',
    generatedAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
    nodes: [
      {
        id: 'node-1',
        name: 'Node 1',
        objectives: ['Understand node 1'],
        prerequisites: [],
        status: 'in_progress',
      },
    ],
  };
}

function createModelWithConfidence(confidence: number) {
  const model = initializeLearnerModel('chat-1', createPlan());
  model.mastery['node-1'] = {
    ...model.mastery['node-1'],
    confidence,
  };
  model.globalMetrics = {
    totalInteractions: model.globalMetrics?.totalInteractions ?? 0,
    accuracyRate: model.globalMetrics?.accuracyRate ?? 0,
    averageConfidence: confidence,
  };
  return model;
}

test('estimatedConfidence sets absolute confidence without implicit positive bump', () => {
  const model = createModelWithConfidence(0.3);
  const result = applyLearnerModelFeedback(model, {
    nodeId: 'node-1',
    estimatedConfidence: 0.1,
    reason: 'Set to 10%',
  });

  assert.equal(result.from, 0.3);
  assert.equal(result.to, 0.1);
  assert.equal(result.model.mastery['node-1'].confidence, 0.1);
  assert.equal(result.model.mastery['node-1'].interactions, model.mastery['node-1'].interactions);
});

test('magnitude without direction is treated as absolute confidence target', () => {
  const model = createModelWithConfidence(0.75);
  const result = applyLearnerModelFeedback(model, {
    nodeId: 'node-1',
    magnitude: 0.1,
    reason: 'Use 10% as my confidence',
  });

  assert.equal(result.from, 0.75);
  assert.equal(result.to, 0.1);
  assert.equal(result.model.mastery['node-1'].confidence, 0.1);
  assert.equal(result.model.mastery['node-1'].interactions, model.mastery['node-1'].interactions);
});

test('confidenceFloor applies without adding implicit directional adjustment', () => {
  const model = createModelWithConfidence(0.3);
  const result = applyLearnerModelFeedback(model, {
    nodeId: 'node-1',
    confidenceFloor: 0.5,
    reason: 'Floor at 50%',
  });

  assert.equal(result.from, 0.3);
  assert.equal(result.to, 0.5);
  assert.equal(result.model.mastery['node-1'].confidence, 0.5);
  assert.equal(result.model.mastery['node-1'].interactions, model.mastery['node-1'].interactions);
});
