import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LearnerModel, LearningPlan } from '@/lib/types';
import {
  apply,
  emptyTutorState,
  explainTopic,
  fold,
  type TutorEvent,
} from '@/modules/tutor/engine';
import { QUIZ_ITEMS, teaching } from '@/modules/tutor/engine/testSupport';

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** A session that touches every kind of event. */
function busySession() {
  const h = teaching();
  h.tutor({ type: 'give_quiz', items: QUIZ_ITEMS }, 'm1');
  const quizId = Object.keys(h.state.quizzes)[0];
  h.learner({ type: 'answer_quiz_item', quizId, itemId: 'q1', choice: 0 });
  h.learner({ type: 'answer_quiz_item', quizId, itemId: 'q2', choice: 0 });
  h.learner({ type: 'answer_quiz_item', quizId, itemId: 'q3', choice: 1 });
  h.tutor({ type: 'note_misconception', description: 'Plugs in before simplifying' });
  h.tutor({ type: 'record_evidence', kind: 'applied', note: 'Solved one', source: 'observation' });
  h.learner({ type: 'adjust_mastery', nodeId: 'limits', setTo: 0.9 });
  h.learner({ type: 'resolve_misconception', misconceptionId: 'plugs-in-before-simplifying' });
  h.learner({ type: 'flag_review', nodeId: 'limits', flagged: true });
  h.tutor({ type: 'complete_topic', how: 'mastered' });
  return h;
}

test('fold is deterministic and order-independent in its input array', () => {
  const h = busySession();
  const once = fold(h.events);
  const twice = fold(h.events);
  assert.deepEqual(once, twice);
  assert.deepEqual(fold([...h.events].reverse()), once);
});

test('folding the log reproduces the state built step by step', () => {
  const h = busySession();
  assert.deepEqual(fold(h.events), h.state);
});

test('apply never mutates the state or the event', () => {
  const h = busySession();
  const events = h.events.map((e) => structuredClone(e));
  let state = deepFreeze(emptyTutorState());
  for (const event of events) {
    state = deepFreeze(apply(state, deepFreeze(event)));
  }
  assert.deepEqual(state, h.state);
});

test('seq and derived fields are maintained', () => {
  const h = busySession();
  assert.equal(h.state.lastSeq, h.events.length);
  assert.deepEqual(
    h.events.map((e) => e.seq),
    h.events.map((_, i) => i + 1),
  );
  assert.equal(h.state.phase, 'interlude');
  assert.equal(h.state.currentNodeId, undefined);
  assert.equal(h.state.awaiting, undefined);
});

test('events for a topic outside the plan and answers to unknown cards are ignored', () => {
  const h = teaching();
  const base = { id: 'x', chatId: 'chat-1', at: 1, by: 'tutor' as const };
  const stray: TutorEvent[] = [
    {
      ...base,
      seq: 100,
      type: 'evidence_recorded',
      nodeId: 'nope',
      source: 'observation',
      kind: 'applied',
      weight: 0.3,
      note: 'n',
    },
    {
      ...base,
      seq: 101,
      type: 'quiz_answered',
      quizId: 'nope',
      itemId: 'q1',
      choice: 0,
      correct: true,
    },
  ];
  const after = stray.reduce(apply, h.state);
  assert.deepEqual(after.mastery, h.state.mastery);
  assert.deepEqual(after.quizzes, h.state.quizzes);
  assert.equal(after.lastSeq, 101);
});

test('legacy import seeds plan, mastery baseline and a pending proposal', () => {
  const plan: LearningPlan = {
    goal: 'Old goal',
    generatedAt: 1,
    updatedAt: 1,
    version: 3,
    nodes: [
      { id: 'a', name: 'A', objectives: ['x'], prerequisites: [], status: 'completed' },
      { id: 'b', name: 'B', objectives: ['x'], prerequisites: ['a'], status: 'in_progress' },
      { id: 'c', name: 'C', objectives: ['x'], prerequisites: [], status: 'in_progress' },
    ],
  };
  const learnerModel: LearnerModel = {
    chatId: 'chat-1',
    updatedAt: 1,
    version: 1,
    mastery: {
      b: {
        nodeId: 'b',
        confidence: 0.64,
        interactions: 4,
        lastInteraction: 1,
        evidence: [{ timestamp: 1, type: 'correct_answer', details: 'old', weight: 0.4 }],
        misconceptions: [],
      },
    },
  };
  const state = fold([
    {
      id: 'e1',
      chatId: 'chat-1',
      seq: 1,
      at: 50,
      by: 'system',
      type: 'legacy_imported',
      plan,
      learnerModel,
      proposal: { proposalId: 'p-old', plan },
    },
  ]);
  assert.equal(state.currentNodeId, 'b', 'only one topic stays in progress');
  assert.equal(state.plan?.nodes[2].status, 'not_started');
  assert.equal(state.mastery.b.confidence, 0.64);
  assert.equal(state.mastery.b.baseline, 0.64);
  assert.equal(state.mastery.c.confidence, 0.3);
  assert.equal(state.phase, 'proposal');
  assert.deepEqual(state.awaiting, { kind: 'proposal', id: 'p-old' });

  const why = explainTopic(state, 'b');
  assert.equal(why?.start, 0.64);
  assert.equal(
    why?.steps.length,
    0,
    'pre-log evidence is summarized by the baseline, not replayed',
  );
  assert.equal(why?.confidence, state.mastery.b.confidence);
});
