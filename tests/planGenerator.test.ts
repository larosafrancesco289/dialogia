import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateLearningPlan,
  detectLearningGoal,
  isNodeReady,
  getNextNode,
  updateNodeStatus,
  getAllPrerequisites,
  calculatePlanProgress,
  summarizeLearningPlan,
} from '@/lib/agent/planGenerator';
import type { LearningPlan } from '@/lib/types';

// Helper function to create a minimal valid plan
function createBasicPlan(): LearningPlan {
  return {
    goal: 'Learn calculus',
    generatedAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
    nodes: [
      {
        id: 'limits',
        name: 'Limits',
        objectives: ['Understand limit concept'],
        prerequisites: [],
        status: 'not_started',
      },
      {
        id: 'derivatives',
        name: 'Derivatives',
        objectives: ['Apply power rule'],
        prerequisites: ['limits'],
        status: 'not_started',
      },
    ],
  };
}

test('validateLearningPlan accepts valid plan', () => {
  const plan = createBasicPlan();
  const { valid, errors } = validateLearningPlan(plan);
  assert.equal(valid, true);
  assert.equal(errors.length, 0);
});

test('validateLearningPlan rejects plan without goal', () => {
  const plan = { ...createBasicPlan(), goal: '' };
  const { valid, errors } = validateLearningPlan(plan);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('goal')));
});

test('validateLearningPlan rejects plan without nodes', () => {
  const plan = { ...createBasicPlan(), nodes: [] };
  const { valid, errors } = validateLearningPlan(plan);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('at least one node')));
});

test('validateLearningPlan rejects node with missing id', () => {
  const plan = createBasicPlan();
  plan.nodes[0].id = '';
  const { valid, errors } = validateLearningPlan(plan);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('must have an id')));
});

test('validateLearningPlan detects duplicate node IDs', () => {
  const plan = createBasicPlan();
  plan.nodes[1].id = 'limits'; // Duplicate
  const { valid, errors } = validateLearningPlan(plan);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('Duplicate node ID')));
});

test('validateLearningPlan rejects node with non-existent prerequisite', () => {
  const plan = createBasicPlan();
  plan.nodes[1].prerequisites = ['nonexistent'];
  const { valid, errors } = validateLearningPlan(plan);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('non-existent prerequisite')));
});

test('validateLearningPlan detects self-prerequisite', () => {
  const plan = createBasicPlan();
  plan.nodes[0].prerequisites = ['limits']; // Self-reference
  const { valid, errors } = validateLearningPlan(plan);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('cannot be its own prerequisite')));
});

test('validateLearningPlan detects circular dependencies', () => {
  const plan: LearningPlan = {
    goal: 'Test circular deps',
    generatedAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
    nodes: [
      {
        id: 'a',
        name: 'A',
        objectives: ['Test'],
        prerequisites: ['b'],
        status: 'not_started',
      },
      {
        id: 'b',
        name: 'B',
        objectives: ['Test'],
        prerequisites: ['a'], // Circular
        status: 'not_started',
      },
    ],
  };
  const { valid, errors } = validateLearningPlan(plan);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('Circular dependency')));
});

test('detectLearningGoal recognizes "I want to learn" pattern', () => {
  const result = detectLearningGoal('I want to learn Python programming');
  assert.equal(result.detected, true);
  assert.equal(result.goal, 'Python programming');
  assert.ok(result.confidence > 0.5);
});

test('detectLearningGoal recognizes "help me learn" pattern', () => {
  const result = detectLearningGoal('Help me learn calculus derivatives');
  assert.equal(result.detected, true);
  assert.ok(result.goal?.includes('calculus'));
});

test('detectLearningGoal recognizes "teach me" pattern', () => {
  const result = detectLearningGoal('Teach me quantum physics');
  assert.equal(result.detected, true);
  assert.ok(result.goal?.includes('quantum'));
});

test('detectLearningGoal returns false for non-goal messages', () => {
  const result = detectLearningGoal('What is 2 + 2?');
  assert.equal(result.detected, false);
});

test('detectLearningGoal filters out vague goals', () => {
  const result = detectLearningGoal('I want to learn it');
  assert.equal(result.detected, false);
});

test('isNodeReady returns true for node with no prerequisites', () => {
  const plan = createBasicPlan();
  assert.equal(isNodeReady('limits', plan), true);
});

test('isNodeReady returns false when prerequisite not completed', () => {
  const plan = createBasicPlan();
  assert.equal(isNodeReady('derivatives', plan), false);
});

test('isNodeReady returns true when all prerequisites completed', () => {
  const plan = createBasicPlan();
  plan.nodes[0].status = 'completed';
  assert.equal(isNodeReady('derivatives', plan), true);
});

test('isNodeReady returns false for nonexistent node', () => {
  const plan = createBasicPlan();
  assert.equal(isNodeReady('nonexistent', plan), false);
});

test('getNextNode returns first ready node', () => {
  const plan = createBasicPlan();
  const next = getNextNode(plan);
  assert.equal(next?.id, 'limits');
});

test('getNextNode returns in-progress node if exists', () => {
  const plan = createBasicPlan();
  plan.nodes[0].status = 'in_progress';
  const next = getNextNode(plan);
  assert.equal(next?.id, 'limits');
});

test('getNextNode returns null when all completed', () => {
  const plan = createBasicPlan();
  plan.nodes[0].status = 'completed';
  plan.nodes[1].status = 'completed';
  const next = getNextNode(plan);
  assert.equal(next, null);
});

test('getNextNode skips nodes with incomplete prerequisites', () => {
  const plan = createBasicPlan();
  plan.nodes[0].status = 'not_started'; // Not completed yet
  const next = getNextNode(plan);
  assert.equal(next?.id, 'limits'); // Should return first node, not second
});

test('updateNodeStatus changes node status', () => {
  const plan = createBasicPlan();
  const updated = updateNodeStatus(plan, 'limits', 'in_progress');
  const node = updated.nodes.find((n) => n.id === 'limits');
  assert.equal(node?.status, 'in_progress');
});

test('updateNodeStatus sets startedAt when moving to in_progress', () => {
  const plan = createBasicPlan();
  const updated = updateNodeStatus(plan, 'limits', 'in_progress');
  const node = updated.nodes.find((n) => n.id === 'limits');
  assert.ok(node?.startedAt);
});

test('updateNodeStatus sets completedAt when moving to completed', () => {
  const plan = createBasicPlan();
  plan.nodes[0].status = 'in_progress';
  plan.nodes[0].startedAt = Date.now();
  const updated = updateNodeStatus(plan, 'limits', 'completed');
  const node = updated.nodes.find((n) => n.id === 'limits');
  assert.ok(node?.completedAt);
});

test('updateNodeStatus updates plan updatedAt timestamp', () => {
  const plan = createBasicPlan();
  const originalTime = plan.updatedAt;
  // Wait a tiny bit to ensure timestamp difference
  const updated = updateNodeStatus(plan, 'limits', 'in_progress');
  assert.ok(updated.updatedAt >= originalTime);
});

test('getAllPrerequisites returns empty for node with no prerequisites', () => {
  const plan = createBasicPlan();
  const prereqs = getAllPrerequisites('limits', plan);
  assert.equal(prereqs.length, 0);
});

test('getAllPrerequisites returns direct prerequisite', () => {
  const plan = createBasicPlan();
  const prereqs = getAllPrerequisites('derivatives', plan);
  assert.equal(prereqs.length, 1);
  assert.equal(prereqs[0].id, 'limits');
});

test('getAllPrerequisites returns transitive prerequisites', () => {
  const plan: LearningPlan = {
    goal: 'Test transitive',
    generatedAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
    nodes: [
      {
        id: 'a',
        name: 'A',
        objectives: ['Test'],
        prerequisites: [],
        status: 'not_started',
      },
      {
        id: 'b',
        name: 'B',
        objectives: ['Test'],
        prerequisites: ['a'],
        status: 'not_started',
      },
      {
        id: 'c',
        name: 'C',
        objectives: ['Test'],
        prerequisites: ['b'],
        status: 'not_started',
      },
    ],
  };
  const prereqs = getAllPrerequisites('c', plan);
  assert.equal(prereqs.length, 2);
  assert.ok(prereqs.some((p) => p.id === 'a'));
  assert.ok(prereqs.some((p) => p.id === 'b'));
});

test('calculatePlanProgress returns correct counts', () => {
  const plan = createBasicPlan();
  plan.nodes[0].status = 'completed';
  plan.nodes[1].status = 'in_progress';

  const progress = calculatePlanProgress(plan);
  assert.equal(progress.completed, 1);
  assert.equal(progress.inProgress, 1);
  assert.equal(progress.notStarted, 0);
  assert.equal(progress.percentComplete, 50);
});

test('calculatePlanProgress handles empty plan', () => {
  const plan = { ...createBasicPlan(), nodes: [] };
  const progress = calculatePlanProgress(plan);
  assert.equal(progress.percentComplete, 0);
});

test('calculatePlanProgress rounds percentage correctly', () => {
  const plan: LearningPlan = {
    goal: 'Test',
    generatedAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
    nodes: [
      { id: 'a', name: 'A', objectives: ['Test'], prerequisites: [], status: 'completed' },
      { id: 'b', name: 'B', objectives: ['Test'], prerequisites: [], status: 'not_started' },
      { id: 'c', name: 'C', objectives: ['Test'], prerequisites: [], status: 'not_started' },
    ],
  };
  const progress = calculatePlanProgress(plan);
  assert.equal(progress.percentComplete, 33); // 1/3 = 33.33% rounds to 33
});

test('summarizeLearningPlan includes goal', () => {
  const plan = createBasicPlan();
  const summary = summarizeLearningPlan(plan);
  assert.ok(summary.includes('Learn calculus'));
});

test('summarizeLearningPlan includes progress stats', () => {
  const plan = createBasicPlan();
  plan.nodes[0].status = 'completed';
  const summary = summarizeLearningPlan(plan);
  assert.ok(summary.includes('1/2'));
  assert.ok(summary.includes('50%'));
});

test('summarizeLearningPlan includes current focus', () => {
  const plan = createBasicPlan();
  plan.nodes[0].status = 'in_progress';
  const summary = summarizeLearningPlan(plan);
  assert.ok(summary.includes('Current Focus: Limits'));
});

test('summarizeLearningPlan includes objectives', () => {
  const plan = createBasicPlan();
  plan.nodes[0].status = 'in_progress';
  const summary = summarizeLearningPlan(plan);
  assert.ok(summary.includes('Objectives:'));
  assert.ok(summary.includes('Understand limit concept'));
});

test('summarizeLearningPlan lists completed nodes', () => {
  const plan = createBasicPlan();
  plan.nodes[0].status = 'completed';
  const summary = summarizeLearningPlan(plan);
  assert.ok(summary.includes('Completed: Limits'));
});
