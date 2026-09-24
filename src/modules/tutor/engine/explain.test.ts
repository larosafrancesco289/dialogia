import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MASTERY_PRIOR, explainTopic } from '@/modules/tutor/engine';
import { QUIZ_ITEMS, teaching } from '@/modules/tutor/engine/testSupport';

test('the replay lands exactly on the stored value through weights, clamps and placements', () => {
  const h = teaching();
  h.tutor({ type: 'give_quiz', items: QUIZ_ITEMS });
  const quizId = h.state.awaiting!.id;
  h.learner({ type: 'answer_quiz_item', quizId, itemId: 'q1', choice: 0 });
  h.learner({ type: 'answer_quiz_item', quizId, itemId: 'q2', choice: 2 });
  h.tutor({
    type: 'record_evidence',
    kind: 'insight',
    weight: 9,
    note: 'Saw why',
    source: 'observation',
  });
  h.learner({ type: 'adjust_mastery', nodeId: 'limits', setTo: 0.37 });
  h.tutor({
    type: 'record_evidence',
    kind: 'struggled',
    weight: -0.45,
    note: 'Stuck on a one-sided limit',
    source: 'observation',
  });
  h.learner({ type: 'answer_quiz_item', quizId, itemId: 'q3', choice: 1 });

  const why = explainTopic(h.state, 'limits');
  assert.ok(why);
  assert.equal(why.start, MASTERY_PRIOR);
  assert.equal(why.steps.length, 6);
  assert.equal(why.confidence, h.state.mastery.limits.confidence, 'exact, not approximately');
  assert.equal(why.steps.at(-1)!.after, h.state.mastery.limits.confidence);
  for (let i = 1; i < why.steps.length; i += 1) {
    assert.equal(why.steps[i].before, why.steps[i - 1].after);
  }
  assert.equal(why.steps[3].after, 0.37);
  assert.deepEqual(
    why.steps.map((s) => s.eventId),
    h.state.mastery.limits.evidence.map((e) => e.eventId),
  );
});

test('each step reads as a plain sentence', () => {
  const h = teaching();
  h.tutor({ type: 'give_quiz', items: QUIZ_ITEMS.slice(0, 1) });
  h.learner({ type: 'answer_quiz_item', quizId: h.state.awaiting!.id, itemId: 'q1', choice: 0 });
  h.tutor({
    type: 'record_evidence',
    kind: 'struggled',
    note: 'Needed a hint',
    source: 'observation',
  });
  h.learner({ type: 'adjust_mastery', nodeId: 'limits', setTo: 0.5 });
  const [quiz, observed, placed] = explainTopic(h.state, 'limits')!.steps.map((s) => s.text);
  assert.equal(quiz, 'Quiz, right: "lim x->0 of x?" (+40% of the gap to 100%): 30% -> 58%');
  assert.equal(observed, 'The tutor observed: Needed a hint (-20% of the estimate): 58% -> 46%');
  assert.equal(placed, 'You: Set to 50% by the learner. (set directly): 46% -> 50%');
  assert.equal(explainTopic(h.state, 'limits')!.startText, 'Every topic starts at 30%.');
});

test('unknown topics have no explanation', () => {
  assert.equal(explainTopic(teaching().state, 'ghost'), undefined);
});
