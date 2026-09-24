import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CALCULUS, QUIZ_ITEMS, harness, teaching } from '@/modules/tutor/engine/testSupport';
import {
  cardsForMessage,
  effectsByMessage,
  evidenceBehind,
  marginReason,
} from '@/modules/tutor/ui/messageViews';

const session = (h: ReturnType<typeof harness>) => ({
  events: h.events,
  state: h.state,
  loaded: true,
});

test('a margin note never drops a reason silently: the latest two, then "+N more"', () => {
  const notes = [
    'Quiz, right: "What does P(A|B) describe?"',
    'Applied the rule to the test example.',
    'Explained the base rate',
  ];
  const folded = marginReason(notes, false);
  assert.equal(folded.more, 1);
  assert.equal(folded.text, 'Applied the rule to the test example. Explained the base rate.');
  const open = marginReason(notes, true);
  assert.equal(open.more, 0);
  // The quoted question keeps its own question mark and gains no full stop.
  assert.equal(
    open.text,
    'Quiz, right: "What does P(A|B) describe?" Applied the rule to the test example. Explained the base rate.',
  );
});

test('a quiz answer and the tutor’s own observation in one reply are both in its note', () => {
  const h = teaching();
  h.tutor({ type: 'give_quiz', items: QUIZ_ITEMS.slice(0, 1) }, 'reply-1');
  h.learner(
    { type: 'answer_quiz_item', quizId: h.state.awaiting!.id, itemId: 'q1', choice: 0 },
    'reply-1',
  );
  h.tutor(
    { type: 'record_evidence', kind: 'insight', note: 'Saw why', source: 'observation' },
    'reply-1',
  );
  const [change] = effectsByMessage(h.events).get('reply-1')!.masteryChanges;
  assert.equal(change.notes.length, 2);
  assert.match(marginReason(change.notes, false).text, /Saw why\.$/);
});

test('the evidence behind an estimate is counted whole, every source named', () => {
  const h = harness();
  h.tutor({
    type: 'propose_plan',
    ...CALCULUS,
    nodes: CALCULUS.nodes.map((node, i) =>
      i === 0 ? { ...node, startingEstimate: { value: 0.6, reason: 'Did some before' } } : node,
    ),
  });
  h.learner({ type: 'approve_plan', proposalId: h.state.proposal!.proposalId });
  h.tutor({ type: 'give_quiz', items: QUIZ_ITEMS.slice(0, 1) });
  h.learner({ type: 'answer_quiz_item', quizId: h.state.awaiting!.id, itemId: 'q1', choice: 0 });
  h.tutor({ type: 'record_evidence', kind: 'applied', note: 'One', source: 'observation' });
  h.tutor({ type: 'record_evidence', kind: 'explained', note: 'Two', source: 'observation' });
  assert.equal(
    evidenceBehind(h.state.mastery.limits.evidence),
    'one answer, two observations and a starting estimate',
  );
  assert.equal(evidenceBehind([]), undefined);
});

test('a proposal card settles for good: approved, changes requested, revised below', () => {
  const h = harness();
  h.tutor({ type: 'propose_plan', ...CALCULUS }, 'plan-1');
  const first = h.state.proposal!.proposalId;
  assert.equal(cardsForMessage(session(h), 'plan-1').proposal?.status, 'pending');

  h.learner({ type: 'decline_plan', proposalId: first, feedback: 'Shorter' }, 'plan-1');
  assert.equal(cardsForMessage(session(h), 'plan-1').proposal?.status, 'declined');

  h.tutor({ type: 'propose_plan', ...CALCULUS, nodes: CALCULUS.nodes.slice(0, 2) }, 'plan-2');
  assert.equal(cardsForMessage(session(h), 'plan-1').proposal?.status, 'replaced');

  h.learner({ type: 'approve_plan', proposalId: h.state.proposal!.proposalId }, 'plan-2');
  assert.equal(cardsForMessage(session(h), 'plan-1').proposal?.status, 'replaced');
  assert.equal(cardsForMessage(session(h), 'plan-2').proposal?.status, 'approved');
});
