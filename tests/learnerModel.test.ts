import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initializeLearnerModel,
  updateLearnerModel,
  calculateMastery,
  generateModelSummary,
  getLatestLearnerModel,
} from '@/lib/agent/learnerModel';
import type {
  LearningPlan,
  LearnerModel,
  Evidence,
  Misconception,
  Message,
} from '@/lib/types';

// ============================================================================
// Helper Functions
// ============================================================================

function createMockPlan(): LearningPlan {
  return {
    goal: 'Learn calculus derivatives',
    generatedAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
    nodes: [
      {
        id: 'limits',
        name: 'Limits',
        description: 'Understanding limits',
        objectives: ['Define limit concept', 'Evaluate simple limits'],
        prerequisites: [],
        status: 'completed',
        estimatedMinutes: 30,
      },
      {
        id: 'derivatives',
        name: 'Basic Derivatives',
        description: 'Power rule and basic differentiation',
        objectives: ['Apply power rule', 'Understand rate of change'],
        prerequisites: ['limits'],
        status: 'in_progress',
        estimatedMinutes: 45,
      },
      {
        id: 'chain_rule',
        name: 'Chain Rule',
        description: 'Differentiating composite functions',
        objectives: ['Identify composite functions', 'Apply chain rule'],
        prerequisites: ['derivatives'],
        status: 'not_started',
        estimatedMinutes: 60,
      },
    ],
  };
}

function createMockMessage(
  role: 'user' | 'assistant',
  content: string,
): Message {
  return {
    id: `msg_${Date.now()}_${Math.random()}`,
    chatId: 'chat_test',
    role,
    content,
    createdAt: Date.now(),
  };
}

// ============================================================================
// Tests: initializeLearnerModel
// ============================================================================

test('initializeLearnerModel creates model with all nodes', () => {
  const plan = createMockPlan();
  const model = initializeLearnerModel('chat_1', plan);

  assert.equal(model.chatId, 'chat_1');
  assert.equal(model.version, 1);
  assert.equal(Object.keys(model.mastery).length, 3);
  assert.ok(model.mastery['limits']);
  assert.ok(model.mastery['derivatives']);
  assert.ok(model.mastery['chain_rule']);
});

test('initializeLearnerModel sets initial confidence to 0.3', () => {
  const plan = createMockPlan();
  const model = initializeLearnerModel('chat_1', plan);

  assert.equal(model.mastery['limits'].confidence, 0.3);
  assert.equal(model.mastery['derivatives'].confidence, 0.3);
  assert.equal(model.mastery['chain_rule'].confidence, 0.3);
});

test('initializeLearnerModel sets interactions to 0', () => {
  const plan = createMockPlan();
  const model = initializeLearnerModel('chat_1', plan);

  assert.equal(model.mastery['limits'].interactions, 0);
  assert.equal(model.mastery['derivatives'].interactions, 0);
  assert.equal(model.mastery['chain_rule'].interactions, 0);
});

test('initializeLearnerModel initializes empty evidence arrays', () => {
  const plan = createMockPlan();
  const model = initializeLearnerModel('chat_1', plan);

  assert.equal(model.mastery['limits'].evidence.length, 0);
  assert.equal(model.mastery['limits'].misconceptions.length, 0);
});

test('initializeLearnerModel sets global metrics', () => {
  const plan = createMockPlan();
  const model = initializeLearnerModel('chat_1', plan);

  assert.ok(model.globalMetrics);
  assert.equal(model.globalMetrics.totalInteractions, 0);
  assert.equal(model.globalMetrics.accuracyRate, 0);
  assert.equal(model.globalMetrics.averageConfidence, 0.3);
});

// ============================================================================
// Tests: calculateMastery
// ============================================================================

test('calculateMastery increases confidence on positive evidence', () => {
  const evidence: Evidence = {
    timestamp: Date.now(),
    type: 'correct_answer',
    details: 'Student answered correctly',
    weight: 0.3,
  };

  const newConfidence = calculateMastery(0.5, evidence);
  assert.ok(newConfidence > 0.5);
  assert.ok(newConfidence <= 1.0);
});

test('calculateMastery decreases confidence on negative evidence', () => {
  const evidence: Evidence = {
    timestamp: Date.now(),
    type: 'incorrect_answer',
    details: 'Student answered incorrectly',
    weight: -0.3,
  };

  const newConfidence = calculateMastery(0.5, evidence);
  assert.ok(newConfidence < 0.5);
  assert.ok(newConfidence >= 0);
});

test('calculateMastery has diminishing returns at high confidence', () => {
  const evidence: Evidence = {
    timestamp: Date.now(),
    type: 'correct_answer',
    details: 'Correct',
    weight: 0.3,
  };

  const increase1 = calculateMastery(0.3, evidence) - 0.3;
  const increase2 = calculateMastery(0.8, evidence) - 0.8;

  // Increase at 0.3 should be larger than increase at 0.8
  assert.ok(increase1 > increase2);
});

test('calculateMastery clamps confidence to [0, 1]', () => {
  const strongPositive: Evidence = {
    timestamp: Date.now(),
    type: 'correct_answer',
    details: 'Correct',
    weight: 0.5,
  };

  const strongNegative: Evidence = {
    timestamp: Date.now(),
    type: 'incorrect_answer',
    details: 'Wrong',
    weight: -0.5,
  };

  // Test upper bound
  let confidence = 0.95;
  for (let i = 0; i < 10; i++) {
    confidence = calculateMastery(confidence, strongPositive);
  }
  assert.ok(confidence <= 1.0);

  // Test lower bound
  confidence = 0.05;
  for (let i = 0; i < 10; i++) {
    confidence = calculateMastery(confidence, strongNegative);
  }
  assert.ok(confidence >= 0);
});

test('calculateMastery with zero weight does not change confidence', () => {
  const evidence: Evidence = {
    timestamp: Date.now(),
    type: 'explanation_requested',
    details: 'Neutral',
    weight: 0,
  };

  const newConfidence = calculateMastery(0.5, evidence);
  assert.equal(newConfidence, 0.5);
});

// ============================================================================
// Tests: updateLearnerModel
// ============================================================================

test('updateLearnerModel adds evidence to topic', () => {
  const plan = createMockPlan();
  const model = initializeLearnerModel('chat_1', plan);

  const evidence: Evidence = {
    timestamp: Date.now(),
    type: 'correct_answer',
    details: 'Applied power rule correctly',
    weight: 0.3,
  };

  const updated = updateLearnerModel(model, {
    nodeId: 'derivatives',
    evidence,
  });

  assert.equal(updated.mastery['derivatives'].evidence.length, 1);
  assert.equal(updated.mastery['derivatives'].evidence[0].type, 'correct_answer');
});

test('updateLearnerModel increments interaction count', () => {
  const plan = createMockPlan();
  const model = initializeLearnerModel('chat_1', plan);

  const evidence: Evidence = {
    timestamp: Date.now(),
    type: 'correct_answer',
    details: 'Correct',
    weight: 0.2,
  };

  const updated = updateLearnerModel(model, {
    nodeId: 'derivatives',
    evidence,
  });

  assert.equal(updated.mastery['derivatives'].interactions, 1);
  assert.ok(updated.globalMetrics!.totalInteractions >= 1);
});

test('updateLearnerModel updates confidence', () => {
  const plan = createMockPlan();
  const model = initializeLearnerModel('chat_1', plan);

  const evidence: Evidence = {
    timestamp: Date.now(),
    type: 'correct_answer',
    details: 'Correct',
    weight: 0.3,
  };

  const updated = updateLearnerModel(model, {
    nodeId: 'derivatives',
    evidence,
  });

  const oldConfidence = model.mastery['derivatives'].confidence;
  const newConfidence = updated.mastery['derivatives'].confidence;
  assert.ok(newConfidence > oldConfidence);
});

test('updateLearnerModel adds new misconception', () => {
  const plan = createMockPlan();
  const model = initializeLearnerModel('chat_1', plan);

  const evidence: Evidence = {
    timestamp: Date.now(),
    type: 'incorrect_answer',
    details: 'Applied power rule incorrectly',
    weight: -0.2,
  };

  const misconception: Misconception = {
    id: 'misc_1',
    description: 'Forgets to bring down exponent',
    firstObserved: Date.now(),
    occurrences: 1,
    resolved: false,
  };

  const updated = updateLearnerModel(model, {
    nodeId: 'derivatives',
    evidence,
    misconception,
  });

  assert.equal(updated.mastery['derivatives'].misconceptions.length, 1);
  assert.equal(
    updated.mastery['derivatives'].misconceptions[0].description,
    'Forgets to bring down exponent',
  );
});

test('updateLearnerModel increments existing misconception count', () => {
  const plan = createMockPlan();
  const model = initializeLearnerModel('chat_1', plan);

  const evidence1: Evidence = {
    timestamp: Date.now(),
    type: 'incorrect_answer',
    details: 'Wrong',
    weight: -0.2,
  };

  const misconception1: Misconception = {
    id: 'misc_1',
    description: 'Same error',
    firstObserved: Date.now(),
    occurrences: 1,
    resolved: false,
  };

  const updated1 = updateLearnerModel(model, {
    nodeId: 'derivatives',
    evidence: evidence1,
    misconception: misconception1,
  });

  const evidence2: Evidence = {
    timestamp: Date.now(),
    type: 'incorrect_answer',
    details: 'Wrong again',
    weight: -0.2,
  };

  const misconception2: Misconception = {
    id: 'misc_2',
    description: 'Same error', // Same description
    firstObserved: Date.now(),
    occurrences: 1,
    resolved: false,
  };

  const updated2 = updateLearnerModel(updated1, {
    nodeId: 'derivatives',
    evidence: evidence2,
    misconception: misconception2,
  });

  assert.equal(updated2.mastery['derivatives'].misconceptions.length, 1);
  assert.equal(updated2.mastery['derivatives'].misconceptions[0].occurrences, 2);
});

test('updateLearnerModel updates global accuracy rate', () => {
  const plan = createMockPlan();
  const model = initializeLearnerModel('chat_1', plan);

  // Add some correct answers
  let updated = model;
  for (let i = 0; i < 3; i++) {
    updated = updateLearnerModel(updated, {
      nodeId: 'derivatives',
      evidence: {
        timestamp: Date.now(),
        type: 'correct_answer',
        details: 'Correct',
        weight: 0.2,
      },
    });
  }

  // Add one incorrect answer
  updated = updateLearnerModel(updated, {
    nodeId: 'derivatives',
    evidence: {
      timestamp: Date.now(),
      type: 'incorrect_answer',
      details: 'Wrong',
      weight: -0.2,
    },
  });

  // Accuracy should be 3/4 = 0.75
  assert.ok(updated.globalMetrics!.accuracyRate >= 0.7);
  assert.ok(updated.globalMetrics!.accuracyRate <= 0.8);
});

test('updateLearnerModel updates average confidence', () => {
  const plan = createMockPlan();
  const model = initializeLearnerModel('chat_1', plan);

  const updated = updateLearnerModel(model, {
    nodeId: 'derivatives',
    evidence: {
      timestamp: Date.now(),
      type: 'correct_answer',
      details: 'Correct',
      weight: 0.3,
    },
  });

  // Average should increase slightly
  const oldAvg = model.globalMetrics!.averageConfidence;
  const newAvg = updated.globalMetrics!.averageConfidence;
  assert.ok(newAvg > oldAvg);
});

test('updateLearnerModel handles nonexistent node gracefully', () => {
  const plan = createMockPlan();
  const model = initializeLearnerModel('chat_1', plan);

  const updated = updateLearnerModel(model, {
    nodeId: 'nonexistent',
    evidence: {
      timestamp: Date.now(),
      type: 'correct_answer',
      details: 'Correct',
      weight: 0.2,
    },
  });

  // Should return unchanged model
  assert.deepEqual(updated, model);
});

// ============================================================================
// Tests: generateModelSummary
// ============================================================================

test('generateModelSummary includes all nodes', () => {
  const plan = createMockPlan();
  const model = initializeLearnerModel('chat_1', plan);

  const summary = generateModelSummary(model, plan);

  assert.ok(summary.includes('Limits'));
  assert.ok(summary.includes('Basic Derivatives'));
  assert.ok(summary.includes('Chain Rule'));
});

test('generateModelSummary shows confidence percentages', () => {
  const plan = createMockPlan();
  const model = initializeLearnerModel('chat_1', plan);

  const summary = generateModelSummary(model, plan);

  // Should show 30% for initial confidence
  assert.ok(summary.includes('30%'));
});

test('generateModelSummary includes interaction counts', () => {
  const plan = createMockPlan();
  const model = initializeLearnerModel('chat_1', plan);

  const updated = updateLearnerModel(model, {
    nodeId: 'derivatives',
    evidence: {
      timestamp: Date.now(),
      type: 'correct_answer',
      details: 'Correct',
      weight: 0.2,
    },
  });

  const summary = generateModelSummary(updated, plan);

  assert.ok(summary.includes('1 interaction'));
});

test('generateModelSummary shows current node with lightning bolt', () => {
  const plan = createMockPlan();
  const model = initializeLearnerModel('chat_1', plan);

  const summary = generateModelSummary(model, plan);

  // Current node (in_progress) should have ⚡
  assert.ok(summary.includes('⚡'));
});

test('generateModelSummary includes active misconceptions', () => {
  const plan = createMockPlan();
  const model = initializeLearnerModel('chat_1', plan);

  const updated = updateLearnerModel(model, {
    nodeId: 'derivatives',
    evidence: {
      timestamp: Date.now(),
      type: 'incorrect_answer',
      details: 'Wrong',
      weight: -0.2,
    },
    misconception: {
      id: 'misc_1',
      description: 'Confuses product rule with power rule',
      firstObserved: Date.now(),
      occurrences: 2,
      resolved: false,
    },
  });

  const summary = generateModelSummary(updated, plan);

  assert.ok(summary.includes('Confuses product rule with power rule'));
  assert.ok(summary.includes('2x'));
});

test('generateModelSummary excludes resolved misconceptions', () => {
  const plan = createMockPlan();
  const model = initializeLearnerModel('chat_1', plan);

  const updated = updateLearnerModel(model, {
    nodeId: 'derivatives',
    evidence: {
      timestamp: Date.now(),
      type: 'incorrect_answer',
      details: 'Wrong',
      weight: -0.2,
    },
    misconception: {
      id: 'misc_1',
      description: 'Resolved error',
      firstObserved: Date.now(),
      occurrences: 1,
      resolved: true, // Marked as resolved
    },
  });

  const summary = generateModelSummary(updated, plan);

  assert.ok(!summary.includes('Resolved error'));
});

test('generateModelSummary includes overall metrics', () => {
  const plan = createMockPlan();
  const model = initializeLearnerModel('chat_1', plan);

  const summary = generateModelSummary(model, plan);

  assert.ok(summary.includes('Overall:'));
  assert.ok(summary.includes('accuracy'));
  assert.ok(summary.includes('avg confidence'));
});

// ============================================================================
// Tests: getLatestLearnerModel
// ============================================================================

test('getLatestLearnerModel returns undefined for empty history', () => {
  const messages: Message[] = [];
  const model = getLatestLearnerModel(messages);
  assert.equal(model, undefined);
});

test('getLatestLearnerModel returns undefined when no model attached', () => {
  const messages: Message[] = [
    createMockMessage('user', 'Hello'),
    createMockMessage('assistant', 'Hi'),
  ];
  const model = getLatestLearnerModel(messages);
  assert.equal(model, undefined);
});

test('getLatestLearnerModel returns model from last assistant message', () => {
  const plan = createMockPlan();
  const mockModel = initializeLearnerModel('chat_1', plan);

  const messages: Message[] = [
    createMockMessage('user', 'Question 1'),
    { ...createMockMessage('assistant', 'Answer 1'), learnerModel: mockModel },
    createMockMessage('user', 'Question 2'),
    createMockMessage('assistant', 'Answer 2'),
  ];

  const model = getLatestLearnerModel(messages);
  assert.ok(model);
  assert.equal(model.chatId, 'chat_1');
});

test('getLatestLearnerModel returns most recent model', () => {
  const plan = createMockPlan();
  const model1 = initializeLearnerModel('chat_1', plan);
  const model2 = updateLearnerModel(model1, {
    nodeId: 'derivatives',
    evidence: {
      timestamp: Date.now(),
      type: 'correct_answer',
      details: 'Correct',
      weight: 0.3,
    },
  });

  const messages: Message[] = [
    createMockMessage('user', 'Q1'),
    { ...createMockMessage('assistant', 'A1'), learnerModel: model1 },
    createMockMessage('user', 'Q2'),
    { ...createMockMessage('assistant', 'A2'), learnerModel: model2 },
  ];

  const model = getLatestLearnerModel(messages);
  assert.ok(model);
  // Should have the updated model with evidence
  assert.equal(model.mastery['derivatives'].evidence.length, 1);
});

test('getLatestLearnerModel searches backwards from end', () => {
  const plan = createMockPlan();
  const mockModel = initializeLearnerModel('chat_1', plan);

  const messages: Message[] = [
    { ...createMockMessage('assistant', 'A1'), learnerModel: mockModel },
    createMockMessage('user', 'Q2'),
    createMockMessage('assistant', 'A2'),
    createMockMessage('user', 'Q3'),
  ];

  const model = getLatestLearnerModel(messages);
  assert.ok(model);
  assert.equal(model.chatId, 'chat_1');
});
