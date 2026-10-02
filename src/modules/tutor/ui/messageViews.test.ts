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
  carriedOverWords,
  effectsByMessage,
  marginChanges,
  marginReason,
  readableNote,
  seamOpen,
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
  assert.equal(
    open.text,
    'Got the quiz question right. Applied the rule to the test example. Explained the base rate.',
  );
});

test('graded answers are counted in words, never quoted back from the log', () => {
  const notes = [
    'Quiz, right: "What does P(A|B) describe?"',
    'Quiz, wrong: "Which is larger?"',
    'Quiz, right: "What is a base rate?"',
  ];
  assert.equal(marginReason(notes, false).text, 'Got 2 of 3 quiz questions right.');
  assert.equal(
    readableNote('Diagnostic, wrong: "Which is larger?"'),
    'You missed a quick check question: “Which is larger?”',
  );
  assert.equal(readableNote('Saw why'), 'Saw why');
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

test('a carried-over start says where it came from, in the note under the approval and in words', () => {
  const source = teaching();
  master(source);
  const h = harness();
  h.otherChats = { 'chat-src': source.state };
  h.tutor(
    {
      type: 'propose_plan',
      ...CALCULUS,
      nodes: CALCULUS.nodes.map((node, i) =>
        i === 0 ? { ...node, carriedFrom: { chatId: 'chat-src', topic: 'Limits' } } : node,
      ),
    },
    'plan-1',
  );
  h.learner({ type: 'approve_plan', proposalId: h.state.proposal!.proposalId }, 'plan-1');
  const [change] = marginChanges(effectsByMessage(h.events).get('plan-1')!);
  assert.equal(change.to, 0.75);
  assert.deepEqual(change.notes, []);
  const carried = change.carriedOver!;
  assert.equal(carried.chatId, 'chat-src');

  const at = {
    ...carried,
    estimate: 0.84,
    studiedAt: new Date(new Date().getFullYear(), 8, 27).getTime(),
  };
  assert.equal(
    carriedOverWords(at, 0.75, 'Limits', 'Learning limits'),
    'Carried over from Learning limits (84%, 27\u00a0Sep), capped at 75% until you answer two questions here.',
  );
  assert.equal(
    carriedOverWords({ ...at, estimate: 0.6 }, 0.6, 'Limits of functions', undefined),
    'Carried over from Limits in another learning session (60%, 27\u00a0Sep).',
  );
  assert.equal(
    carriedOverWords({ ...at, estimate: 0.6 }, 0.6, 'Limits of functions', 'Calculus I'),
    'Carried over from Limits in Calculus I (60%, 27\u00a0Sep).',
  );
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

test('a correction at an open chapter break moves its estimate, and the settled break keeps it', () => {
  const h = teaching();
  master(h);
  h.tutor({ type: 'complete_topic', how: 'mastered' }, 'reply-1');
  const atCompletion = h.state.mastery.limits.confidence;
  // A copy each time: the app's log is a new array per change, and the replay is cached per array.
  const breakOf = () => effectsByMessage([...h.events]).get('reply-1')!.completed!;
  assert.equal(breakOf().mastery?.confidence, atCompletion);

  // "Too high" in the Hub while the break still asks whether to move on.
  h.learner({ type: 'adjust_mastery', nodeId: 'limits', setTo: 0.65 });
  assert.equal(breakOf().mastery?.confidence, 0.65, 'the live break states the estimate as it is');

  h.learner({ type: 'start_topic', nodeId: 'derivatives' });
  assert.equal(breakOf().nextNodeId, 'derivatives');
  assert.equal(breakOf().mastery?.confidence, 0.65, 'settled on what the learner went on with');

  // Later changes to the topic belong to later exchanges, not to this seam.
  h.learner({ type: 'adjust_mastery', nodeId: 'limits', setTo: 0.4 });
  assert.equal(breakOf().mastery?.confidence, 0.65);
});

test('a chapter break stays open through a correction at the seam, until something starts', () => {
  const h = teaching();
  master(h);
  h.tutor({ type: 'complete_topic', how: 'mastered' }, 'reply-1');
  const open = (messageId = 'reply-1') =>
    seamOpen(effectsByMessage([...h.events]).get(messageId)?.completed, h.state.phase);
  assert.equal(open(), true);
  assert.equal(open('reply-0'), false, 'a message without a break');

  // "Too high" on the margin note: a correction is no choice at the seam.
  h.learner({ type: 'adjust_mastery', nodeId: 'limits', setTo: 0.65 });
  assert.equal(open(), true, 'the learner still chooses what comes next');

  h.learner({ type: 'start_topic', nodeId: 'derivatives' });
  assert.equal(open(), false);
});

test('a margin note keeps the correction that answered it, from the log alone', () => {
  const h = teaching();
  h.tutor(
    {
      type: 'record_evidence',
      kind: 'explained',
      note: 'Explained a limit',
      source: 'observation',
    },
    'reply-1',
  );
  const noteOf = (messageId: string) =>
    effectsByMessage([...h.events]).get(messageId)!.masteryChanges[0];
  assert.equal(noteOf('reply-1').corrected, undefined);

  // "Too low" on the note: a quiet correction, attached to no message.
  h.learner({ type: 'adjust_mastery', nodeId: 'limits', setTo: 0.59 });
  const answered = noteOf('reply-1');
  assert.equal(answered.corrected, 0.59, 'what a reload reads, as the live note did');
  assert.notEqual(answered.to, 0.59, 'the note still says what the exchange did');

  // Once a later exchange moves the estimate, a correction answers that one instead.
  h.tutor(
    { type: 'record_evidence', kind: 'applied', note: 'Applied it', source: 'observation' },
    'reply-2',
  );
  h.learner({ type: 'adjust_mastery', nodeId: 'limits', setTo: 0.5 });
  assert.equal(noteOf('reply-1').corrected, 0.59);
  assert.equal(noteOf('reply-2').corrected, 0.5);
});

test('an evidence note speaks to the learner, without the engine prefix', () => {
  assert.equal(
    readableNote('Starting estimate from the diagnostic: knows the terms'),
    'knows the terms',
  );
  assert.equal(
    readableNote('From what the learner said before the plan'),
    'From what you said before the plan',
  );
  assert.equal(readableNote('Learner explained it well'), 'You explained it well');
  assert.equal(
    readableNote('Quiz, right: "What is the derivative of f at t..."'),
    'You answered a quiz question correctly: “What is the derivative of f at t…”',
  );
});
