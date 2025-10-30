import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generatePlanContextPreamble,
  shouldCompleteNode,
  processPlanProgress,
  isPlanComplete,
  getPlanCompletionPercentage,
  getEstimatedRemainingTime,
  getReadyTopics,
  generateProgressReport,
} from '@/lib/agent/planAwareTutor';
import { initializeLearnerModel, updateLearnerModel } from '@/lib/agent/learnerModel';
import type { LearningPlan, LearnerModel, Evidence } from '@/lib/types';

// ============================================================================
// Helper Functions
// ============================================================================

function createMockPlan(): LearningPlan {
  return {
    goal: 'Master Calculus Derivatives',
    generatedAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
    nodes: [
      {
        id: 'limits',
        name: 'Limits',
        description: 'Understanding limits as foundation',
        objectives: ['Define limit concept', 'Evaluate simple limits'],
        prerequisites: [],
        status: 'completed',
        completedAt: Date.now() - 10000,
        estimatedMinutes: 30,
      },
      {
        id: 'derivatives',
        name: 'Basic Derivatives',
        description: 'Power rule and basic differentiation',
        objectives: ['Apply power rule', 'Understand rate of change'],
        prerequisites: ['limits'],
        status: 'in_progress',
        startedAt: Date.now() - 5000,
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

function createHighConfidenceModel(plan: LearningPlan, nodeId: string): LearnerModel {
  const model = initializeLearnerModel('chat_1', plan);

  // Simulate multiple correct answers to build confidence
  let updated = model;
  for (let i = 0; i < 6; i++) {
    updated = updateLearnerModel(updated, {
      nodeId,
      evidence: {
        timestamp: Date.now(),
        type: 'correct_answer',
        details: `Correct answer ${i + 1}`,
        weight: 0.15,
      },
    });
  }

  return updated;
}

// ============================================================================
// Tests: generatePlanContextPreamble
// ============================================================================

test('generatePlanContextPreamble includes plan summary', () => {
  const plan = createMockPlan();
  const model = initializeLearnerModel('chat_1', plan);

  const preamble = generatePlanContextPreamble(plan, model);

  assert.ok(preamble.includes('LEARNING PLAN CONTEXT'));
  assert.ok(preamble.includes(plan.goal));
});

test('generatePlanContextPreamble includes learner model summary', () => {
  const plan = createMockPlan();
  const model = initializeLearnerModel('chat_1', plan);

  const preamble = generatePlanContextPreamble(plan, model);

  assert.ok(preamble.includes('STUDENT MASTERY'));
  assert.ok(preamble.includes('Limits'));
  assert.ok(preamble.includes('Basic Derivatives'));
});

test('generatePlanContextPreamble shows current focus', () => {
  const plan = createMockPlan();
  const model = initializeLearnerModel('chat_1', plan);

  const preamble = generatePlanContextPreamble(plan, model);

  assert.ok(preamble.includes('CURRENT FOCUS: Basic Derivatives'));
  assert.ok(preamble.includes('Learning Objectives:'));
});

test('generatePlanContextPreamble includes teaching strategy', () => {
  const plan = createMockPlan();
  const model = initializeLearnerModel('chat_1', plan);

  const preamble = generatePlanContextPreamble(plan, model);

  assert.ok(preamble.includes('TEACHING STRATEGY:'));
  assert.ok(preamble.includes('Socratic method'));
  assert.ok(preamble.includes('prerequisite mastery'));
});

test('generatePlanContextPreamble includes progression rules', () => {
  const plan = createMockPlan();
  const model = initializeLearnerModel('chat_1', plan);

  const preamble = generatePlanContextPreamble(plan, model);

  assert.ok(preamble.includes('PROGRESSION RULES:'));
  assert.ok(preamble.includes('Confidence < 50%'));
  assert.ok(preamble.includes('Confidence > 70%'));
});

test('generatePlanContextPreamble handles completed plan', () => {
  const plan = createMockPlan();
  // Mark all nodes as completed
  plan.nodes.forEach((node) => {
    node.status = 'completed';
  });

  const model = initializeLearnerModel('chat_1', plan);
  const preamble = generatePlanContextPreamble(plan, model);

  assert.ok(preamble.includes('completed all topics'));
  assert.ok(preamble.includes('Goal achieved'));
});

test('generatePlanContextPreamble handles missing learner model', () => {
  const plan = createMockPlan();
  const preamble = generatePlanContextPreamble(plan, undefined);

  assert.ok(preamble.includes('Learner model not yet initialized'));
});

// ============================================================================
// Tests: shouldCompleteNode
// ============================================================================

test('shouldCompleteNode returns false when confidence too low', () => {
  const plan = createMockPlan();
  const model = initializeLearnerModel('chat_1', plan);

  const result = shouldCompleteNode('derivatives', model, plan);

  assert.equal(result.shouldComplete, false);
  assert.ok(result.reasoning.includes('Confidence too low'));
});

test('shouldCompleteNode returns false when not enough interactions', () => {
  const plan = createMockPlan();
  let model = initializeLearnerModel('chat_1', plan);

  // Add multiple correct answers to get high confidence (above 0.7)
  // but keep interactions below 5
  for (let i = 0; i < 4; i++) {
    model = updateLearnerModel(model, {
      nodeId: 'derivatives',
      evidence: {
        timestamp: Date.now(),
        type: 'correct_answer',
        details: 'Correct',
        weight: 0.2,
      },
    });
  }

  const result = shouldCompleteNode('derivatives', model, plan);

  assert.equal(result.shouldComplete, false);
  assert.ok(result.reasoning.includes('Not enough practice'));
});

test('shouldCompleteNode returns false when has unresolved misconceptions', () => {
  const plan = createMockPlan();
  let model = createHighConfidenceModel(plan, 'derivatives');

  // Add misconception without changing confidence much
  // Use a very small negative weight so confidence stays above 0.7
  model = updateLearnerModel(model, {
    nodeId: 'derivatives',
    evidence: {
      timestamp: Date.now(),
      type: 'incorrect_answer',
      details: 'Wrong',
      weight: -0.01, // Very small negative weight
    },
    misconception: {
      id: 'misc_1',
      description: 'Confuses power rule',
      firstObserved: Date.now(),
      occurrences: 1,
      resolved: false,
    },
  });

  // Verify misconception was added and confidence still high
  assert.equal(model.mastery['derivatives'].misconceptions.length, 1);
  assert.equal(model.mastery['derivatives'].misconceptions[0].resolved, false);
  assert.ok(model.mastery['derivatives'].confidence >= 0.7, 'Confidence should still be >= 0.7');

  const result = shouldCompleteNode('derivatives', model, plan);

  assert.equal(result.shouldComplete, false);
  assert.ok(result.reasoning.includes('misconception'));
});

test('shouldCompleteNode returns true when all conditions met', () => {
  const plan = createMockPlan();
  const model = createHighConfidenceModel(plan, 'derivatives');

  const result = shouldCompleteNode('derivatives', model, plan);

  assert.equal(result.shouldComplete, true);
  assert.ok(result.reasoning.includes('Confidence'));
  assert.ok(result.reasoning.includes('no misconceptions'));
});

test('shouldCompleteNode returns false when node already completed', () => {
  const plan = createMockPlan();
  const model = createHighConfidenceModel(plan, 'limits');

  const result = shouldCompleteNode('limits', model, plan);

  assert.equal(result.shouldComplete, false);
  assert.ok(result.reasoning.includes('already marked as completed'));
});

test('shouldCompleteNode handles nonexistent node', () => {
  const plan = createMockPlan();
  const model = initializeLearnerModel('chat_1', plan);

  const result = shouldCompleteNode('nonexistent', model, plan);

  assert.equal(result.shouldComplete, false);
  assert.ok(result.reasoning.includes('No mastery data'));
});

// ============================================================================
// Tests: processPlanProgress
// ============================================================================

test('processPlanProgress completes node when ready', async () => {
  const plan = createMockPlan();
  const model = createHighConfidenceModel(plan, 'derivatives');

  const result = await processPlanProgress(plan, model);

  assert.ok(result.planUpdates);
  assert.equal(result.planUpdates.statusChanges!.length, 2); // Complete current, start next
  assert.equal(result.planUpdates.statusChanges![0].nodeId, 'derivatives');
  assert.equal(result.planUpdates.statusChanges![0].to, 'completed');
  assert.ok(result.progressMessage);
  assert.ok(result.progressMessage.includes('Completed topic'));
});

test('processPlanProgress starts next node after completion', async () => {
  const plan = createMockPlan();
  const model = createHighConfidenceModel(plan, 'derivatives');

  const result = await processPlanProgress(plan, model);

  assert.ok(result.planUpdates);
  assert.equal(result.planUpdates.statusChanges![1].nodeId, 'chain_rule');
  assert.equal(result.planUpdates.statusChanges![1].to, 'in_progress');
  assert.ok(result.progressMessage!.includes('Moving to next topic'));
});

test('processPlanProgress does nothing when node not ready', async () => {
  const plan = createMockPlan();
  const model = initializeLearnerModel('chat_1', plan);

  const result = await processPlanProgress(plan, model);

  assert.equal(result.planUpdates, undefined);
  assert.equal(result.progressMessage, undefined);
});

test('processPlanProgress detects plan completion', async () => {
  const plan = createMockPlan();

  // Mark first two nodes as completed
  plan.nodes[0].status = 'completed';
  plan.nodes[1].status = 'completed';
  plan.nodes[2].status = 'in_progress';

  const model = createHighConfidenceModel(plan, 'chain_rule');

  const result = await processPlanProgress(plan, model);

  assert.ok(result.progressMessage);
  assert.ok(result.progressMessage.includes('completed the entire learning plan'));
});

test('processPlanProgress returns unchanged when plan complete', async () => {
  const plan = createMockPlan();
  plan.nodes.forEach((node) => {
    node.status = 'completed';
  });

  const model = initializeLearnerModel('chat_1', plan);

  const result = await processPlanProgress(plan, model);

  assert.equal(result.planUpdates, undefined);
  assert.equal(result.progressMessage, undefined);
});

// ============================================================================
// Tests: isPlanComplete
// ============================================================================

test('isPlanComplete returns false for incomplete plan', () => {
  const plan = createMockPlan();
  assert.equal(isPlanComplete(plan), false);
});

test('isPlanComplete returns true when all nodes completed', () => {
  const plan = createMockPlan();
  plan.nodes.forEach((node) => {
    node.status = 'completed';
  });
  assert.equal(isPlanComplete(plan), true);
});

// ============================================================================
// Tests: getPlanCompletionPercentage
// ============================================================================

test('getPlanCompletionPercentage calculates correctly', () => {
  const plan = createMockPlan();
  // 1 out of 3 completed
  const percentage = getPlanCompletionPercentage(plan);
  assert.equal(percentage, 33); // Rounded from 33.33%
});

test('getPlanCompletionPercentage returns 100 for completed plan', () => {
  const plan = createMockPlan();
  plan.nodes.forEach((node) => {
    node.status = 'completed';
  });
  const percentage = getPlanCompletionPercentage(plan);
  assert.equal(percentage, 100);
});

test('getPlanCompletionPercentage returns 0 for fresh plan', () => {
  const plan = createMockPlan();
  plan.nodes.forEach((node) => {
    node.status = 'not_started';
  });
  const percentage = getPlanCompletionPercentage(plan);
  assert.equal(percentage, 0);
});

// ============================================================================
// Tests: getEstimatedRemainingTime
// ============================================================================

test('getEstimatedRemainingTime sums incomplete node times', () => {
  const plan = createMockPlan();
  // derivatives (in_progress) = 45 min
  // chain_rule (not_started) = 60 min
  // Total = 105 min
  const remaining = getEstimatedRemainingTime(plan);
  assert.equal(remaining, 105);
});

test('getEstimatedRemainingTime returns 0 for completed plan', () => {
  const plan = createMockPlan();
  plan.nodes.forEach((node) => {
    node.status = 'completed';
  });
  const remaining = getEstimatedRemainingTime(plan);
  assert.equal(remaining, 0);
});

test('getEstimatedRemainingTime handles missing estimatedMinutes', () => {
  const plan = createMockPlan();
  delete plan.nodes[1].estimatedMinutes;
  const remaining = getEstimatedRemainingTime(plan);
  assert.equal(remaining, 60); // Only chain_rule
});

// ============================================================================
// Tests: getReadyTopics
// ============================================================================

test('getReadyTopics returns nodes with prerequisites met', () => {
  const plan = createMockPlan();
  const ready = getReadyTopics(plan);

  // Only 'derivatives' is ready (limits completed, not yet completed itself)
  assert.equal(ready.length, 1);
  assert.equal(ready[0].id, 'derivatives');
});

test('getReadyTopics excludes completed nodes', () => {
  const plan = createMockPlan();
  plan.nodes[1].status = 'completed'; // Complete derivatives
  const ready = getReadyTopics(plan);

  // Now chain_rule is ready
  assert.equal(ready.length, 1);
  assert.equal(ready[0].id, 'chain_rule');
});

test('getReadyTopics excludes nodes with incomplete prerequisites', () => {
  const plan = createMockPlan();
  plan.nodes[0].status = 'in_progress'; // Limits not completed
  const ready = getReadyTopics(plan);

  // Limits is still ready (in_progress, no prerequisites)
  // But derivatives and chain_rule are not ready (need limits completed)
  assert.equal(ready.length, 1);
  assert.equal(ready[0].id, 'limits');
});

test('getReadyTopics handles no prerequisites', () => {
  const plan = createMockPlan();
  plan.nodes[0].status = 'not_started';
  const ready = getReadyTopics(plan);

  // Limits has no prerequisites, so it's ready
  assert.equal(ready.length, 1);
  assert.equal(ready[0].id, 'limits');
});

// ============================================================================
// Tests: generateProgressReport
// ============================================================================

test('generateProgressReport includes completion percentage', () => {
  const plan = createMockPlan();
  const model = initializeLearnerModel('chat_1', plan);

  const report = generateProgressReport(plan, model);

  assert.ok(report.includes('Progress Report'));
  assert.ok(report.includes('1/3')); // 1 completed out of 3
  assert.ok(report.includes('33%'));
});

test('generateProgressReport lists all topics with status', () => {
  const plan = createMockPlan();
  const model = initializeLearnerModel('chat_1', plan);

  const report = generateProgressReport(plan, model);

  assert.ok(report.includes('Limits'));
  assert.ok(report.includes('Basic Derivatives'));
  assert.ok(report.includes('Chain Rule'));
  assert.ok(report.includes('✓ Completed'));
  assert.ok(report.includes('⚡ In progress'));
  assert.ok(report.includes('○ Not started'));
});

test('generateProgressReport includes global metrics', () => {
  const plan = createMockPlan();
  let model = initializeLearnerModel('chat_1', plan);

  // Add some interactions
  model = updateLearnerModel(model, {
    nodeId: 'derivatives',
    evidence: {
      timestamp: Date.now(),
      type: 'correct_answer',
      details: 'Correct',
      weight: 0.2,
    },
  });

  const report = generateProgressReport(plan, model);

  assert.ok(report.includes('Overall Performance'));
  assert.ok(report.includes('Accuracy:'));
  assert.ok(report.includes('Average Confidence:'));
  assert.ok(report.includes('Total Interactions:'));
});

test('generateProgressReport includes time estimate', () => {
  const plan = createMockPlan();
  const model = initializeLearnerModel('chat_1', plan);

  const report = generateProgressReport(plan, model);

  assert.ok(report.includes('Estimated time remaining'));
  assert.ok(report.includes('1h 45m')); // 105 minutes = 1h 45m
});

test('generateProgressReport shows confidence per topic', () => {
  const plan = createMockPlan();
  const model = createHighConfidenceModel(plan, 'derivatives');

  const report = generateProgressReport(plan, model);

  // Should show confidence percentages
  assert.ok(report.includes('% confidence'));
  assert.ok(report.includes('Basic Derivatives'));
});
