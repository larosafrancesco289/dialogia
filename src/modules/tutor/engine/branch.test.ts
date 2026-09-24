import { test } from 'node:test';
import assert from 'node:assert/strict';
import { branchEvents, fold, retractReply, type TutorEvent } from '@/modules/tutor/engine';
import { QUIZ_ITEMS, teaching } from '@/modules/tutor/engine/testSupport';

/** m1 proposed the plan, m2 gave a quiz the learner answered, m3 came after the branch point. */
function session() {
  const h = teaching();
  // `teaching()` proposes and approves without message ids; give them one.
  for (const event of h.events) event.messageId = 'm1';
  h.learner({ type: 'adjust_mastery', nodeId: 'derivatives', setTo: 0.5 });
  h.tutor({ type: 'give_quiz', items: QUIZ_ITEMS }, 'm2');
  const quizId = h.state.awaiting!.id;
  h.learner({ type: 'answer_quiz_item', quizId, itemId: 'q1', choice: 0 }, 'm2');
  const atBranch = h.state;
  h.learner({ type: 'flag_review', nodeId: 'limits', flagged: true });
  h.tutor({ type: 'record_evidence', kind: 'applied', note: 'Later', source: 'observation' }, 'm3');
  return { h, atBranch, quizId };
}

let n = 0;
const spec = (extra: Partial<Parameters<typeof branchEvents>[1]> = {}) => ({
  chatId: 'branch-1',
  copied: { m1: 'c1', m2: 'c2' },
  later: new Set(['m3']),
  newId: () => `copy-${++n}`,
  ...extra,
});

test('a branch inherits the log up to the branch point, under its own ids', () => {
  const { h, atBranch, quizId } = session();
  const copied = branchEvents(h.events, spec());

  assert.ok(copied.every((e) => e.chatId === 'branch-1'));
  assert.ok(copied.every((e) => e.id.startsWith('copy-')));
  assert.ok(copied.every((e) => !e.messageId || ['c1', 'c2'].includes(e.messageId)));
  assert.ok(!copied.some((e) => e.type === 'review_flagged'), 'a quiet edit after the point stays');
  assert.ok(!copied.some((e) => e.type === 'evidence_recorded' && e.note === 'Later'));
  assert.ok(
    copied.some((e) => e.type === 'evidence_recorded' && e.kind === 'adjusted'),
    'a quiet edit before the point comes along',
  );

  const state = fold(copied);
  const confidences = (m: typeof state.mastery) =>
    Object.fromEntries(Object.entries(m).map(([id, t]) => [id, [t.confidence, t.evidence.length]]));
  assert.deepEqual(confidences(state.mastery), confidences(atBranch.mastery));
  assert.equal(state.plan?.nodes.find((x) => x.status === 'in_progress')?.id, 'limits');
  assert.equal(state.quizzes[quizId].messageId, 'c2', 'the copied card renders on its copy');
  assert.deepEqual(state.quizzes[quizId].answers, atBranch.quizzes[quizId].answers);
  assert.equal(state.lastSeq, atBranch.lastSeq, 'positions keep their numbers');
});

test('a branch point a copied reply saw takes in the quiet edits before it', () => {
  const { h } = session();
  const flagSeq = h.events.find((e) => e.type === 'review_flagged')!.seq;
  const copied = branchEvents(h.events, spec({ seenSeq: flagSeq }));
  assert.ok(copied.some((e) => e.type === 'review_flagged'));
});

test('a retracted reply stays retracted in the branch', () => {
  const { h } = session();
  const retraction = retractReply(h.events, 'm2', { chatId: 'chat-1', at: 1, id: 'r' })!;
  const events: TutorEvent[] = [...h.events, retraction];
  const copied = branchEvents(events, spec());
  const moved = copied.find((e) => e.type === 'reply_retracted');
  assert.ok(moved && moved.type === 'reply_retracted' && moved.replyId === 'c2');
  assert.deepEqual(fold(copied).quizzes, {});
});
