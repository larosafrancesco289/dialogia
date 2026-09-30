import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MASTERY_PRIOR,
  STARTING_ESTIMATE_MAX,
  explainTopic,
  fold,
  otherChatsRead,
  parseTutorEvent,
  parseTutorToolCall,
  renderStateBlock,
  step,
  tutorToolResult,
  withAdjustments,
  type TutorToolCommand,
} from '@/modules/tutor/engine';
import {
  CALCULUS,
  QUIZ_ITEMS,
  harness,
  master,
  teaching,
} from '@/modules/tutor/engine/testSupport';
import type { LearningRecord } from '@/lib/types';

const SOURCE = 'chat-src';

/** A finished-ish earlier chat: Limits studied to 85%, Derivatives never touched. */
function earlierChat() {
  const source = teaching();
  master(source);
  return source.state;
}

/** CALCULUS again, with Limits said to continue the earlier chat's Limits. */
function continuing(carriedFrom: { chatId: string; topic: string }[] = []) {
  return {
    ...CALCULUS,
    subject: 'Calculus',
    nodes: CALCULUS.nodes.map((node, i) =>
      carriedFrom[i] ? { ...node, carriedFrom: carriedFrom[i] } : node,
    ),
  };
}

test('a carried-over topic starts from the source estimate at approval, capped, as evidence', () => {
  const source = earlierChat();
  const from = source.mastery.limits;
  assert.ok(from.confidence > STARTING_ESTIMATE_MAX, 'the source is above the cap');

  const h = harness();
  h.otherChats = { [SOURCE]: source };
  h.tutor({ type: 'propose_plan', ...continuing([{ chatId: SOURCE, topic: 'limits' }]) });
  assert.deepEqual(h.state.proposal!.carriedOver, {
    limits: { chatId: SOURCE, nodeId: 'limits', topic: 'Limits' },
  });

  h.learner({ type: 'approve_plan', proposalId: h.state.proposal!.proposalId });
  const limits = h.state.mastery.limits;
  assert.equal(limits.confidence, STARTING_ESTIMATE_MAX);
  assert.equal(limits.evidence.length, 1);
  assert.equal(limits.evidence[0].kind, 'placement');
  assert.deepEqual(limits.evidence[0].carriedOver, {
    chatId: SOURCE,
    topic: 'Limits',
    estimate: from.confidence,
    studiedAt: from.lastInteraction,
  });
  assert.equal(h.state.mastery.derivatives.confidence, MASTERY_PRIOR);
  assert.equal(h.state.plan!.subject, 'Calculus');

  // Contestable like any estimate, and explained where it came from.
  const why = explainTopic(h.state, 'limits')!;
  assert.equal(why.settledAt, 0);
  h.learner({ type: 'adjust_mastery', nodeId: 'limits', setTo: 0.6 });
  assert.equal(h.state.mastery.limits.confidence, 0.6);
});

test('replay is exact without the source chat, and survives storage', () => {
  const source = earlierChat();
  const h = harness();
  h.otherChats = { [SOURCE]: source };
  h.tutor({ type: 'propose_plan', ...continuing([{ chatId: SOURCE, topic: 'Limits' }]) });
  h.learner({ type: 'approve_plan', proposalId: h.state.proposal!.proposalId });
  // The source moves on, or is deleted: this chat's log already holds what was read.
  h.otherChats = {};
  assert.deepEqual(fold(h.events), h.state);
  const stored = h.events.map((event) => parseTutorEvent(JSON.parse(JSON.stringify(event)))!);
  assert.deepEqual(fold(stored), h.state);
});

test('an unknown chat or topic, or one with no estimate, is dropped and named back as adjusted', () => {
  const source = earlierChat();
  const h = harness();
  h.otherChats = { [SOURCE]: source };
  const command = {
    by: 'tutor',
    type: 'propose_plan',
    ...continuing([
      { chatId: 'chat-gone', topic: 'Limits' },
      { chatId: SOURCE, topic: 'Derivatives' },
      { chatId: SOURCE, topic: 'Integrals' },
    ]),
  } satisfies TutorToolCommand;
  const before = h.state;
  const result = step(before, command, h.ctx());
  assert.ok(result.ok);
  assert.equal(result.state.proposal!.carriedOver, undefined);

  const read = withAdjustments(
    tutorToolResult('propose_plan', before, result.state, result.events, command),
    ['from parsing'],
  );
  const adjusted = read.adjusted as string[];
  assert.equal(adjusted[0], 'from parsing');
  assert.equal(adjusted.length, 4);
  assert.match(adjusted[1], /topics\.0\.carriedFrom.*"Limits".*\[chat-gone\]/);
  assert.match(adjusted[2], /topics\.1\.carriedFrom.*"Derivatives"/);
  assert.match(adjusted[3], /topics\.2\.carriedFrom.*"Integrals"/);
});

test('an earlier topic carries to one topic here: the topics built on it start fresh', () => {
  const source = earlierChat();
  const h = harness();
  h.otherChats = { [SOURCE]: source };
  const command = {
    by: 'tutor',
    type: 'propose_plan',
    ...continuing([
      { chatId: SOURCE, topic: 'Limits' },
      { chatId: SOURCE, topic: 'Limits' },
    ]),
  } satisfies TutorToolCommand;
  const before = h.state;
  const result = step(before, command, h.ctx());
  assert.ok(result.ok);
  assert.deepEqual(Object.keys(result.state.proposal!.carriedOver!), ['limits']);
  const read = tutorToolResult('propose_plan', before, result.state, result.events, command);
  assert.match((read.adjusted as string[])[0], /topics\.1\.carriedFrom.*already carries over/);
});

test('a carried-over estimate never closes a topic without two of the learner’s own answers', () => {
  const h = harness();
  h.otherChats = { [SOURCE]: earlierChat() };
  h.tutor({ type: 'propose_plan', ...continuing([{ chatId: SOURCE, topic: 'Limits' }]) });
  h.learner({ type: 'approve_plan', proposalId: h.state.proposal!.proposalId });
  h.tutor({ type: 'give_quiz', items: QUIZ_ITEMS });
  const quizId = h.state.awaiting!.id;
  h.learner({ type: 'answer_quiz_item', quizId, itemId: 'q1', choice: 0 });
  assert.ok(h.state.mastery.limits.confidence >= 0.8, 'ready on the number alone');
  const thin = h.refuse({ by: 'tutor', type: 'complete_topic', how: 'mastered' });
  assert.equal(thin.code, 'not_ready');
  assert.match(thin.message, /only 1 of the 2/);

  h.learner({ type: 'answer_quiz_item', quizId, itemId: 'q2', choice: 1 });
  h.tutor({ type: 'complete_topic', how: 'mastered' });
  assert.equal(h.state.plan!.nodes[0].status, 'completed');
});

test('the store is told which other chats a command reads', () => {
  const h = harness();
  const propose = {
    by: 'tutor',
    type: 'propose_plan',
    ...continuing([
      { chatId: SOURCE, topic: 'Limits' },
      { chatId: SOURCE, topic: 'Derivatives' },
    ]),
  } satisfies TutorToolCommand;
  assert.deepEqual(otherChatsRead(h.state, propose), [SOURCE]);
  h.otherChats = { [SOURCE]: earlierChat() };
  h.tutor(propose);
  const approve = {
    by: 'learner',
    type: 'approve_plan',
    proposalId: h.state.proposal!.proposalId,
  } as const;
  assert.deepEqual(otherChatsRead(h.state, approve), [SOURCE]);
  assert.deepEqual(otherChatsRead(h.state, { by: 'tutor', type: 'start_topic', nodeId: 'x' }), []);
});

test('a revision keeps the subject it leaves out, and carries only into topics with no evidence', () => {
  const h = harness();
  h.otherChats = { [SOURCE]: earlierChat() };
  h.tutor({ type: 'propose_plan', ...continuing() });
  h.learner({ type: 'approve_plan', proposalId: h.state.proposal!.proposalId });
  master(h);
  const earned = h.state.mastery.limits.confidence;
  h.tutor({
    type: 'propose_plan',
    ...CALCULUS,
    nodes: CALCULUS.nodes.map((node, i) =>
      i === 0 ? { ...node, carriedFrom: { chatId: SOURCE, topic: 'Limits' } } : node,
    ),
  });
  h.learner({ type: 'approve_plan', proposalId: h.state.proposal!.proposalId });
  assert.equal(h.state.plan!.subject, 'Calculus');
  assert.equal(h.state.mastery.limits.confidence, earned);
});

test('carriedFrom is parsed leniently, with the subject', () => {
  const parsed = parseTutorToolCall('propose_plan', {
    goal: 'Differentiate',
    subject: 'Calculus',
    topics: [
      {
        name: 'Limits',
        objectives: ['Evaluate limits'],
        carriedFrom: { chatId: SOURCE, topic: 'Limits' },
      },
      { name: 'Derivatives', objectives: ['Differentiate'], carriedFrom: { chatId: SOURCE } },
      { name: 'Chain rule', objectives: ['Compose'], carriedFrom: { chatId: '', topic: '' } },
    ],
  });
  assert.ok(parsed.ok);
  assert.ok(parsed.command.type === 'propose_plan');
  assert.equal(parsed.command.subject, 'Calculus');
  assert.deepEqual(parsed.command.nodes[0].carriedFrom, { chatId: SOURCE, topic: 'Limits' });
  assert.equal(parsed.command.nodes[1].carriedFrom, undefined);
  assert.equal(parsed.command.nodes[2].carriedFrom, undefined);
  assert.deepEqual(parsed.adjusted, [
    'ignored topics.1.carriedFrom: it needs both a chatId and a topic',
  ]);
});

const record = (chatId: string, studiedAt: number, subject?: string): LearningRecord => ({
  chatId,
  goal: `Goal of ${chatId}`,
  ...(subject ? { subject } : {}),
  studiedAt,
  finished: false,
  topics: [
    { name: 'Bayes’ rule', state: 'done', percent: 84, status: 'Done' },
    { name: 'Base rates', state: 'ready', status: 'Up next' },
  ],
});

test('before a plan, the state block lists the five most recently studied other tutor chats', () => {
  const others = [1, 2, 3, 4, 5, 6].map((n) =>
    record(`c${n}`, n, n === 6 ? 'Probability' : undefined),
  );
  const h = harness();
  const block = renderStateBlock(h.state, { flags: h.flags, otherChats: others });
  assert.match(block, /other tutor chats, most recently studied first/);
  assert.match(
    block,
    /- \[c6\] Probability: Goal of c6\n {2}- Bayes’ rule: done, 84%\n {2}- Base rates: not started/,
  );
  assert.ok(block.indexOf('[c6]') < block.indexOf('[c2]'));
  assert.doesNotMatch(block, /\[c1\]/);

  const planned = teaching();
  const later = renderStateBlock(planned.state, { flags: planned.flags, otherChats: others });
  assert.doesNotMatch(later, /other tutor chats/);
});
