import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY_MS,
  DUE_EARLY_MS,
  HOUR_MS,
  dueTopics,
  fold,
  parseTutorEvent,
  renderStateBlock,
  sittingsOf,
  topicSchedule,
  type TutorEvent,
} from '@/modules/tutor/engine';
import {
  MASTERY_ITEMS,
  QUIZ_ITEMS,
  harness,
  master,
  teaching,
  type Harness,
} from '@/modules/tutor/engine/testSupport';

/** The harness's clock: the time of the latest event. */
const clock = (h: Harness) => h.events.at(-1)!.at;

/** Limits mastered and closed in one sitting, Derivatives started. */
function limitsDone(): Harness {
  const h = teaching();
  master(h);
  h.tutor({ type: 'complete_topic', how: 'mastered' }, 'reply-1');
  h.learner({ type: 'start_topic', nodeId: 'derivatives' });
  return h;
}

/** A refresher on `nodeId` with `right` of its three answers right. */
function refresh(h: Harness, nodeId: string, right: number) {
  h.tutor({ type: 'give_quiz', nodeId, items: QUIZ_ITEMS });
  const quizId = h.state.awaiting!.id;
  QUIZ_ITEMS.forEach((item, i) =>
    h.learner({
      type: 'answer_quiz_item',
      quizId,
      itemId: `q${i + 1}`,
      choice: i < right ? item.correct : (item.correct + 1) % item.choices.length,
    }),
  );
}

test('a topic finished in one sitting comes due the next day, and not before', () => {
  const h = limitsDone();
  const studied = clock(h);
  const schedule = topicSchedule(h.state, 'limits')!;
  assert.ok(schedule.lastStudiedAt <= studied && schedule.lastStudiedAt > studied - 10_000);
  assert.equal(schedule.intervalDays, 1);
  assert.equal(schedule.dueAt, schedule.lastStudiedAt + DAY_MS);
  assert.deepEqual(dueTopics(h.state, studied + 12 * HOUR_MS), []);
  assert.deepEqual(
    dueTopics(h.state, schedule.dueAt - DUE_EARLY_MS).map((s) => s.nodeId),
    ['limits'],
  );
  // The topic in progress and topics not studied yet have no schedule.
  assert.equal(topicSchedule(h.state, 'derivatives'), undefined);
  assert.equal(topicSchedule(h.state, 'chain-rule'), undefined);
});

test('a clean refresher taken when due stretches the interval; each later one stretches it more', () => {
  const h = limitsDone();
  h.advance(DAY_MS);
  refresh(h, 'limits', 3);
  const second = topicSchedule(h.state, 'limits')!;
  assert.equal(second.sittings.length, 2);
  assert.ok(second.intervalDays > 2.4 && second.intervalDays < 2.6, `${second.intervalDays}`);

  h.advance(3 * DAY_MS);
  refresh(h, 'limits', 3);
  const third = topicSchedule(h.state, 'limits')!;
  assert.ok(third.intervalDays > 6.9 && third.intervalDays < 7.1, `${third.intervalDays}`);
  assert.deepEqual(dueTopics(h.state, clock(h) + 5 * DAY_MS), []);
  assert.equal(dueTopics(h.state, clock(h) + 7 * DAY_MS).length, 1);
});

test('a refresher an hour later counts as the same sitting and earns nothing', () => {
  const h = limitsDone();
  h.advance(HOUR_MS);
  h.tutor({ type: 'give_quiz', nodeId: 'limits', items: QUIZ_ITEMS });
  const schedule = topicSchedule(h.state, 'limits')!;
  assert.equal(schedule.sittings.length, 1);
  assert.equal(schedule.intervalDays, 1);
});

test('a refresher that mostly misses starts the interval again; a mixed one keeps it', () => {
  const lapsed = limitsDone();
  lapsed.advance(DAY_MS);
  refresh(lapsed, 'limits', 3);
  lapsed.advance(5 * DAY_MS);
  refresh(lapsed, 'limits', 1);
  const after = topicSchedule(lapsed.state, 'limits')!;
  assert.equal(after.sittings.at(-1)!.outcome, 'lapsed');
  assert.equal(after.intervalDays, 1);

  const mixed = limitsDone();
  mixed.advance(DAY_MS);
  refresh(mixed, 'limits', 3);
  const before = topicSchedule(mixed.state, 'limits')!.intervalDays;
  mixed.advance(5 * DAY_MS);
  refresh(mixed, 'limits', 2);
  const kept = topicSchedule(mixed.state, 'limits')!;
  assert.equal(kept.sittings.at(-1)!.outcome, 'mixed');
  assert.equal(kept.intervalDays, before);
});

test('a topic still held after a long gap is trusted for longer than one reviewed on time', () => {
  const onTime = limitsDone();
  onTime.advance(DAY_MS);
  refresh(onTime, 'limits', 3);
  const late = limitsDone();
  late.advance(20 * DAY_MS);
  refresh(late, 'limits', 3);
  assert.ok(
    topicSchedule(late.state, 'limits')!.intervalDays >
      topicSchedule(onTime.state, 'limits')!.intervalDays * 5,
  );
});

test('a refresher counts toward its topic, keeps it done, and spends no quiz on the topic in progress', () => {
  const h = limitsDone();
  const before = h.state.mastery.limits.confidence;
  h.advance(2 * DAY_MS);
  refresh(h, 'limits', 0);
  const limits = h.state.plan!.nodes.find((n) => n.id === 'limits')!;
  assert.equal(limits.status, 'completed');
  assert.equal(limits.completedHow, 'mastered');
  assert.ok(h.state.mastery.limits.confidence < before);
  assert.equal(h.state.currentNodeId, 'derivatives');
  assert.equal(h.state.counts.quizzesByNode.derivatives ?? 0, 0);
  const quiz = Object.values(h.state.quizzes).at(-1)!;
  assert.equal(quiz.review, true);
  assert.equal(quiz.nodeId, 'limits');
});

test('one refresher per topic per sitting, and only on a topic already studied', () => {
  const h = limitsDone();
  h.advance(DAY_MS);
  refresh(h, 'limits', 3);
  assert.equal(
    h.refuse({ by: 'tutor', type: 'give_quiz', nodeId: 'limits', items: QUIZ_ITEMS }).code,
    'budget_exhausted',
  );
  assert.equal(
    h.refuse({ by: 'tutor', type: 'give_quiz', nodeId: 'chain-rule', items: QUIZ_ITEMS }).code,
    'not_studied',
  );
  h.advance(DAY_MS);
  h.tutor({ type: 'give_quiz', nodeId: 'limits', items: QUIZ_ITEMS });
});

test('at a chapter break and once the plan is done, a quiz needs a topic to refresh', () => {
  const h = teaching();
  master(h);
  h.tutor({ type: 'complete_topic', how: 'mastered' }, 'reply-1');
  assert.equal(h.state.phase, 'interlude');
  assert.equal(
    h.refuse({ by: 'tutor', type: 'give_quiz', items: QUIZ_ITEMS }).code,
    'no_current_topic',
  );
  h.advance(DAY_MS);
  h.tutor({ type: 'give_quiz', nodeId: 'limits', items: QUIZ_ITEMS });
  assert.equal(h.state.awaiting?.kind, 'quiz');

  // Before anything is studied there is nothing to refresh outside teaching.
  const fresh = harness();
  assert.equal(
    fresh.refuse({ by: 'tutor', type: 'give_quiz', items: QUIZ_ITEMS }).code,
    'wrong_phase',
  );
});

test('the topic in progress keeps its own quiz budget, and refreshers stay open once it is spent', () => {
  const h = limitsDone();
  for (let i = 0; i < 3; i += 1) {
    h.tutor({ type: 'give_quiz', items: QUIZ_ITEMS });
    h.learner({ type: 'dismiss_card', card: 'quiz', cardId: h.state.awaiting!.id });
  }
  assert.equal(
    h.refuse({ by: 'tutor', type: 'give_quiz', items: QUIZ_ITEMS }).code,
    'budget_exhausted',
  );
  h.advance(DAY_MS);
  h.tutor({ type: 'give_quiz', nodeId: 'limits', items: QUIZ_ITEMS });
});

test('topics the learner left or said they knew never come due; one they flagged is due at once', () => {
  const h = teaching();
  h.tutor({ type: 'give_quiz', items: QUIZ_ITEMS });
  h.learner({ type: 'answer_quiz_item', quizId: h.state.awaiting!.id, itemId: 'q1', choice: 0 });
  h.learner({ type: 'skip_topic', nodeId: 'limits' });
  h.learner({ type: 'mark_known', nodeId: 'derivatives' });
  const later = clock(h) + 30 * DAY_MS;
  assert.deepEqual(dueTopics(h.state, later), []);

  const flagged = limitsDone();
  flagged.learner({ type: 'flag_review', nodeId: 'limits', flagged: true });
  assert.deepEqual(
    dueTopics(flagged.state, clock(flagged)).map((s) => s.nodeId),
    ['limits'],
  );
});

test('an answer that showed a misconception counts as a miss in its sitting', () => {
  const h = teaching();
  h.tutor(
    { type: 'record_evidence', source: 'observation', kind: 'applied', note: 'You plugged in' },
    'reply-1',
  );
  h.tutor({ type: 'note_misconception', description: 'Plugs in too early' }, 'reply-1');
  h.advance(DAY_MS);
  h.tutor(
    { type: 'record_evidence', source: 'observation', kind: 'explained', note: 'You explained it' },
    'reply-2',
  );
  const [first, second] = sittingsOf(h.state.mastery.limits.evidence);
  assert.deepEqual([first.right, first.wrong, first.outcome], [0, 1, 'lapsed']);
  assert.deepEqual([second.right, second.wrong, second.outcome], [1, 0, 'clean']);
});

test('the state block dates each studied topic and lists what is due, only when told the time', () => {
  const h = limitsDone();
  const now = clock(h) + 9 * DAY_MS;
  const block = renderStateBlock(h.state, {
    flags: h.flags,
    now,
    lastExchangeAt: now - 9 * DAY_MS,
  });
  assert.match(block, /^Back after a break: the last exchange here was 9 days ago\.$/m);
  assert.match(
    block,
    /^- Limits \[limits\]: done \(mastered\); ready \d+%; last studied 9 days ago; due for a refresher$/m,
  );
  assert.match(
    block,
    /^Due for a refresher, studied a while ago and not practised since: Limits \[limits\]\.$/m,
  );
  const sameDay = renderStateBlock(h.state, {
    flags: h.flags,
    now: clock(h) + HOUR_MS,
    lastExchangeAt: clock(h),
  });
  assert.doesNotMatch(sameDay, /Back after a break|due for a refresher/i);
  assert.match(sameDay, /last studied 1 hour ago/);
  assert.doesNotMatch(renderStateBlock(h.state, { flags: h.flags }), /last studied|refresher/);
});

test('a refresher survives a reload: the stored event keeps its review mark', () => {
  const h = limitsDone();
  h.advance(DAY_MS);
  h.tutor({ type: 'give_quiz', nodeId: 'limits', items: MASTERY_ITEMS });
  const stored = JSON.parse(JSON.stringify(h.events)) as unknown[];
  const replayed = fold(stored.map(parseTutorEvent).filter((e): e is TutorEvent => !!e));
  const quiz = Object.values(replayed.quizzes).at(-1)!;
  assert.equal(quiz.review, true);
  assert.equal(replayed.counts.quizzesByNode.limits, 1);
});
