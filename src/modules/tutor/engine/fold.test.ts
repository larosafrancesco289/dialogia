import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LearnerModel, LearningPlan } from '@/lib/types';
import {
  apply,
  effectiveEvents,
  emptyTutorState,
  explainTopic,
  fold,
  MASTERY_PRIOR,
  parseTutorEvent,
  remainingBudgets,
  retractReply,
  type TutorEvent,
} from '@/modules/tutor/engine';
import { CALCULUS, QUIZ_ITEMS, harness, teaching } from '@/modules/tutor/engine/testSupport';

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
      messageId: 'm-old',
      type: 'plan_proposed',
      proposalId: 'p-old',
      plan,
      revision: true,
    },
    {
      id: 'e2',
      chatId: 'chat-1',
      seq: 2,
      at: 50,
      by: 'system',
      type: 'legacy_imported',
      plan,
      learnerModel,
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

test('one malformed legacy topic costs only itself, even after a JSON backup', () => {
  const plan: LearningPlan = {
    goal: 'Old goal',
    generatedAt: 1,
    updatedAt: 1,
    version: 1,
    nodes: ['a', 'b', 'c', 'd'].map((id, i) => ({
      id,
      name: id.toUpperCase(),
      objectives: ['x'],
      prerequisites: [],
      status: i === 0 ? ('in_progress' as const) : ('not_started' as const),
    })),
  };
  const topic = (confidence: unknown, weight: unknown = 0.2) => ({
    nodeId: 'x',
    confidence,
    interactions: 1,
    lastInteraction: 1,
    evidence: [
      { timestamp: 1, type: 'correct_answer', details: 'kept', weight: 0.3 },
      { timestamp: 2, type: 'correct_answer', details: 'bad weight', weight },
    ],
    misconceptions: [
      { id: 'm1', description: 'Kept', firstObserved: 1, occurrences: 1, resolved: false },
      { description: 'No id' },
    ],
  });
  // A backup writes NaN as null; that is what an imported chat carries.
  const learnerModel = JSON.parse(
    JSON.stringify({
      chatId: 'chat-1',
      updatedAt: 1,
      version: 1,
      mastery: { a: topic(0.8), b: topic(Number.NaN), c: topic(0.5, null), d: 'not a topic' },
    }),
  );
  const event = parseTutorEvent({
    id: 'e1',
    chatId: 'chat-1',
    seq: 1,
    at: 50,
    by: 'system',
    type: 'legacy_imported',
    plan,
    learnerModel,
  });
  assert.ok(event, 'the import survives its worst topic');
  const state = fold([event]);
  assert.equal(state.mastery.a.confidence, 0.8);
  assert.equal(state.mastery.b.confidence, MASTERY_PRIOR, 'null confidence starts at the prior');
  assert.equal(state.mastery.c.confidence, 0.5);
  assert.deepEqual(
    state.mastery.c.evidence.map((e) => e.details),
    ['kept'],
    'an entry with no usable weight is dropped, the rest kept',
  );
  assert.deepEqual(
    state.mastery.a.misconceptions.map((m) => m.id),
    ['m1'],
  );
  assert.equal(state.mastery.d.confidence, MASTERY_PRIOR, 'an unsalvageable topic starts fresh');
  assert.equal(state.mastery.d.evidence.length, 0);
});

test('legacy import clamps an out-of-range or missing confidence, not just the baseline', () => {
  const plan: LearningPlan = {
    goal: 'Old goal',
    generatedAt: 1,
    updatedAt: 1,
    version: 1,
    nodes: [
      { id: 'a', name: 'A', objectives: ['x'], prerequisites: [], status: 'in_progress' },
      { id: 'b', name: 'B', objectives: ['x'], prerequisites: [], status: 'not_started' },
      { id: 'c', name: 'C', objectives: ['x'], prerequisites: [], status: 'not_started' },
    ],
  };
  const topic = (nodeId: string, confidence: number) => ({
    nodeId,
    confidence,
    interactions: 1,
    lastInteraction: 1,
    evidence: [],
    misconceptions: [],
  });
  const learnerModel: LearnerModel = {
    chatId: 'chat-1',
    updatedAt: 1,
    version: 1,
    mastery: { a: topic('a', 1.4), b: topic('b', -0.2), c: topic('c', Number.NaN) },
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
    },
  ]);
  assert.equal(state.mastery.a.confidence, 1);
  assert.equal(state.mastery.a.baseline, 1);
  assert.equal(state.mastery.b.confidence, 0);
  assert.equal(state.mastery.c.confidence, 0.3);
  assert.equal(state.mastery.c.baseline, 0.3);
  assert.equal(explainTopic(state, 'a')?.confidence, state.mastery.a.confidence);
});

// ---------------------------------------------------------------- retraction

const retract = (events: TutorEvent[], replyId: string) =>
  retractReply(events, replyId, { chatId: 'chat-1', at: 99_000, id: `retract-${replyId}` });

test('retracting a reply takes back its tutor events and the answers to its cards', () => {
  const h = teaching();
  const before = h.state;
  h.tutor(
    { type: 'record_evidence', kind: 'applied', note: 'Solved one', source: 'observation' },
    'm2',
  );
  h.tutor({ type: 'give_quiz', items: QUIZ_ITEMS }, 'm2');
  const quizId = h.state.awaiting!.id;
  h.learner({ type: 'answer_quiz_item', quizId, itemId: 'q1', choice: 0 }, 'm2');
  // A quiet learner edit with no message stays.
  h.learner({ type: 'flag_review', nodeId: 'limits', flagged: true });
  assert.equal(remainingBudgets(h.state).quizzesLeft, 2);

  const retraction = retract(h.events, 'm2');
  assert.ok(retraction);
  assert.equal(retraction.seq, h.events.length + 1);
  const log = [...h.events, retraction];
  const state = fold(log);

  assert.equal(state.quizzes[quizId], undefined, 'the quiz card is gone');
  assert.equal(state.awaiting, undefined);
  assert.equal(remainingBudgets(state).quizzesLeft, 3, 'the budget comes back');
  assert.deepEqual(state.mastery.limits.evidence, [], 'its evidence and graded answers are gone');
  assert.equal(state.mastery.limits.confidence, before.mastery.limits.confidence);
  assert.equal(state.mastery.limits.needsReview, true, 'unrelated learner edits stand');
  assert.equal(state.lastSeq, retraction.seq, 'retracted positions stay spent');
  assert.ok(effectiveEvents(log).every((e) => e.messageId !== 'm2'));
});

test('a regenerated reply keeps its id, and its new events count', () => {
  const h = teaching();
  h.tutor({ type: 'give_quiz', items: QUIZ_ITEMS }, 'm2');
  const first = h.state.awaiting!.id;
  const retraction = retract(h.events, 'm2')!;
  const log: TutorEvent[] = [...h.events, retraction];

  const state = fold(log);
  assert.equal(state.quizzes[first], undefined);
  // The regenerated turn reuses the message id; what it records after the retraction counts.
  const evidence: TutorEvent = {
    id: 'e-after',
    chatId: 'chat-1',
    seq: retraction.seq + 1,
    at: 100_000,
    by: 'tutor',
    messageId: 'm2',
    type: 'evidence_recorded',
    nodeId: 'limits',
    source: 'observation',
    kind: 'applied',
    weight: 0.3,
    note: 'After the regeneration',
  };
  const regenerated = fold([...log, evidence]);
  assert.equal(regenerated.mastery.limits.evidence.length, 1);
  assert.equal(regenerated.mastery.limits.evidence[0].details, 'After the regeneration');

  // Retracting the regenerated reply takes back only what is still counting.
  const second = retract([...log, evidence], 'm2')!;
  assert.equal(fold([...log, evidence, second]).mastery.limits.evidence.length, 0);
  assert.equal(retract([...log, evidence, second], 'm2'), undefined, 'nothing left to retract');
});

test('retracting the reply that proposed a plan takes back the plan approved from it', () => {
  const h = harness();
  h.tutor({ type: 'propose_plan', ...CALCULUS }, 'm1');
  h.learner({ type: 'approve_plan', proposalId: h.state.proposal!.proposalId }, 'm1');
  assert.equal(h.state.phase, 'teaching');
  const state = fold([...h.events, retract(h.events, 'm1')!]);
  assert.equal(state.plan, undefined);
  assert.equal(state.phase, 'intake');
  assert.equal(retract(h.events, 'unknown'), undefined);
});

test('imported history changes no state and spends no quiz budget', () => {
  const plan = fold(teaching().events).plan!;
  const base = { chatId: 'chat-1', at: 1, by: 'system' as const };
  const state = fold([
    {
      ...base,
      id: 'q',
      seq: 1,
      by: 'tutor',
      messageId: 'a1',
      type: 'quiz_given',
      quizId: 'legacy-quiz-a1',
      nodeId: 'limits',
      items: [{ id: 'q1', question: '?', choices: ['a', 'b'], correct: 0 }],
    },
    {
      ...base,
      id: 'p',
      seq: 2,
      messageId: 'a0',
      type: 'proposal_imported',
      proposalId: 'legacy-proposal-a0',
      plan,
      status: 'approved',
    },
    { ...base, id: 'l', seq: 3, type: 'legacy_imported', plan },
  ]);
  assert.equal(state.currentNodeId, 'limits');
  assert.equal(state.proposal, undefined);
  assert.equal(remainingBudgets(state).quizzesLeft, 3);
  assert.ok(state.quizzes['legacy-quiz-a1'], 'the old quiz still renders');
});
