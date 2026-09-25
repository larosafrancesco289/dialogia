import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CALCULUS,
  QUIZ_ITEMS,
  harness,
  master,
  teaching,
} from '@/modules/tutor/engine/testSupport';
import {
  cardsForMessage,
  effectsByMessage,
  evidenceBehind,
  marginChanges,
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

test('a chapter break keeps what happened at its seam, even once the topic is done again', () => {
  const h = teaching();
  master(h);
  h.tutor({ type: 'complete_topic', how: 'mastered' }, 'reply-1');
  const first = h.state.mastery.limits.confidence;
  h.learner({ type: 'more_practice', nodeId: 'limits' });
  master(h);
  h.tutor({ type: 'complete_topic', how: 'mastered' }, 'reply-3');
  h.learner({ type: 'start_topic', nodeId: 'derivatives' });

  const effects = effectsByMessage(h.events);
  const old = effects.get('reply-1')!.completed!;
  assert.equal(old.reopened, true, 'still back for more practice');
  assert.equal(old.nextNodeId, undefined, 'the later Go on belongs to the later break');
  assert.equal(old.mastery?.confidence, first);
  const again = effects.get('reply-3')!.completed!;
  assert.equal(again.reopened, undefined);
  assert.equal(again.nextNodeId, 'derivatives');
});

test('a topic taken up again from Revise settles its break before any later choice', () => {
  const h = teaching();
  master(h);
  h.tutor({ type: 'complete_topic', how: 'mastered' }, 'reply-1');
  h.learner({ type: 'reopen_topic', nodeId: 'limits' });
  h.learner({ type: 'mark_known', nodeId: 'derivatives' });
  h.learner({ type: 'start_topic', nodeId: 'chain-rule' });
  const completed = effectsByMessage(h.events).get('reply-1')!.completed!;
  assert.equal(completed.reopened, true);
  assert.equal(completed.nextNodeId, undefined);
});

test('what a break says the estimate rests on names a request for practice as one', () => {
  const entry = (kind: string, source: 'learner' | 'quiz') => ({
    timestamp: 0,
    type: 'self_report' as const,
    details: '',
    weight: 0,
    source,
    kind,
    eventId: kind,
  });
  assert.equal(
    evidenceBehind([entry('correct_answer', 'quiz'), entry('more_practice', 'learner')]),
    'one answer and your request for more practice',
  );
  assert.equal(evidenceBehind([entry('adjusted', 'learner')]), 'your correction');
});

test('the reply that finishes a topic keeps its margin note beside the chapter break', () => {
  const h = teaching();
  master(h);
  h.tutor(
    { type: 'record_evidence', kind: 'explained', note: 'Explained why', source: 'observation' },
    'reply-1',
  );
  h.tutor({ type: 'complete_topic', how: 'mastered' }, 'reply-1');
  const effects = effectsByMessage(h.events).get('reply-1')!;
  assert.equal(effects.completed?.nodeId, 'limits');
  const [note] = marginChanges(effects);
  assert.equal(note?.nodeId, 'limits', 'the change sits beside the exchange that earned it');
  assert.ok(note.to > note.from);
  assert.deepEqual(note.notes, ['Explained why']);
});
