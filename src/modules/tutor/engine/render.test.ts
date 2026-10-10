import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TUTOR_FLAGS, learnerChangesSince, renderStateBlock } from '@/modules/tutor/engine';
import {
  CALCULUS,
  QUIZ_ITEMS,
  harness,
  master,
  teaching,
} from '@/modules/tutor/engine/testSupport';

const render = (h: ReturnType<typeof harness>, learnerChanges?: string[]) =>
  renderStateBlock(h.state, { flags: h.flags, learnerChanges });

test('an empty session renders the intake phase briefly', () => {
  const block = render(harness());
  assert.equal(
    block,
    [
      'Tutor state',
      'Phase: intake (no plan yet: learn the goal and prior knowledge, then propose a plan)',
      'Budget: 2 diagnostics left.',
      'Learner controls: may change the plan; sees the learner model and may correct it.',
    ].join('\n'),
  );
});

test('while teaching: goal, current topic with objectives, bands, misconceptions, card, budgets', () => {
  const h = teaching();
  h.tutor({ type: 'note_misconception', description: 'Plugs in too early' });
  h.tutor({ type: 'give_quiz', items: QUIZ_ITEMS });
  h.learner({ type: 'answer_quiz_item', quizId: h.state.awaiting!.id, itemId: 'q1', choice: 0 });
  assert.equal(
    render(h),
    [
      'Tutor state',
      'Goal: Differentiate composite functions (0 of 3 topics done)',
      'Phase: teaching',
      'Current topic: Limits [limits]',
      'Objectives: Evaluate simple limits',
      'Card questions on this topic so far, each asked once, the latest last, with how it went. Your next question uses a new case and new numbers:',
      '- "lim x->0 of x?" (quiz, right)',
      '- "lim x->1 of 2x?" (quiz, not answered)',
      '- "lim x->2 of x^2?" (quiz, not answered)',
      'Coming up in the plan, with their own objectives. Teach these there, not inside the current topic; work the learner does on them is evidence for that topic:',
      '- Derivatives [derivatives]: Define the derivative; Apply the power rule',
      '- Chain rule [chain-rule]: Differentiate composite functions',
      'Topics (building < 50%, practising 50-79%, ready >= 80%):',
      '- Limits [limits]: in progress; building 48%',
      '- Derivatives [derivatives]: not started; building 30%; needs limits',
      '- Chain rule [chain-rule]: not started; building 30%; needs derivatives',
      'Open misconceptions:',
      '- plugs-in-too-early on limits: Plugs in too early',
      'Waiting on: the learner to finish your quiz (1 of 3 answered). No other card until they do.',
      'Budget: 2 quizzes left on this topic, 2 diagnostics left.',
      'Learner controls: may change the plan; sees the learner model and may correct it.',
    ].join('\n'),
  );
});

test('the interlude names the next topic and how finished topics closed', () => {
  const h = teaching();
  h.learner({ type: 'mark_known', nodeId: 'limits' });
  const block = render(h);
  assert.match(block, /^Phase: interlude \(a topic just finished/m);
  assert.match(block, /^Next in the plan: Derivatives \[derivatives\]$/m);
  assert.match(block, /^- Limits \[limits\]: done \(known already\); ready 80%$/m);
  assert.match(block, /^- Derivatives \[derivatives\]: not started; building 30%$/m);
});

test('no plan: intake answers, diagnostic results, and a declined proposal are shown', () => {
  const h = harness();
  h.tutor({
    type: 'ask_intake',
    questions: [
      { question: 'Goal?', options: [{ label: 'Exam' }, { label: 'Fun' }] },
      { question: 'Background?', options: [{ label: 'Complete beginner' }, { label: 'Some' }] },
    ],
  });
  h.learner({
    type: 'answer_intake',
    intakeId: h.state.awaiting!.id,
    responses: { q1: ['Exam'], q2: ['Complete beginner'] },
  });
  h.tutor({ type: 'give_diagnostic', topic: 'Algebra', items: QUIZ_ITEMS });
  h.learner({
    type: 'answer_diagnostic',
    diagnosticId: h.state.awaiting!.id,
    answers: { q1: 0, q2: 0, q3: 1 },
  });
  h.tutor({ type: 'propose_plan', ...CALCULUS });
  h.learner({
    type: 'decline_plan',
    proposalId: h.state.proposal!.proposalId,
    feedback: 'Skip limits',
  });
  const block = render(h);
  assert.match(block, /^The learner declined your last plan proposal: "Skip limits"\.$/m);
  assert.match(block, /^Intake answers:\n- "Goal\?": Exam\n- "Background\?": Complete beginner$/m);
  assert.match(
    block,
    /^Diagnostic on "Algebra": 2 of 3 right\. Missed: "lim x->1 of 2x\?" \(chose "1"; right answer "2"\)\.$/m,
  );
  assert.match(block, /^Budget: 1 diagnostic left\.$/m);
});

test('a pending proposal and restricted controls are stated', () => {
  const h = harness({
    planEditable: false,
    learnerModelVisible: false,
    learnerModelEditable: false,
  });
  h.tutor({ type: 'propose_plan', ...CALCULUS });
  const block = render(h);
  assert.match(block, /^Pending plan proposal: limits, derivatives, chain-rule\.$/m);
  assert.match(block, /^Waiting on: the learner to approve or decline your plan proposal\.$/m);
  assert.match(
    block,
    /^Learner controls: may not change the plan; does not see the learner model \(do not quote mastery numbers\)\.$/m,
  );
});

test('learner changes are rendered last and marked authoritative', () => {
  const block = render(teaching(), ['Set Limits to 40% (was 58%).']);
  const lines = block.split('\n');
  assert.match(
    lines.at(-2)!,
    /^Since the learner's last message, the learner changed \(authoritative/,
  );
  assert.equal(lines.at(-1), '- Set Limits to 40% (was 58%).');
});

test('the block has no emoji or box-drawing decoration and stays short', () => {
  const h = teaching();
  h.tutor({ type: 'give_quiz', items: QUIZ_ITEMS });
  const block = render(h, ['Flagged Limits for review.']);
  assert.doesNotMatch(block, /[─-╿\u{1F300}-\u{1FAFF}☀-➿]/u);
  assert.ok(block.length < 1500, `${block.length} chars`);
});

test('learnerChangesSince describes only learner events after the given seq', () => {
  const h = teaching();
  master(h);
  const since = h.state.lastSeq;
  h.tutor({
    type: 'record_evidence',
    kind: 'applied',
    note: 'tutor, not learner',
    source: 'observation',
  });
  h.learner({ type: 'adjust_mastery', nodeId: 'limits', setTo: 0.62 });
  h.learner({ type: 'flag_review', nodeId: 'derivatives', flagged: true });
  h.learner({ type: 'mark_known', nodeId: 'derivatives' });
  h.learner({ type: 'reopen_topic', nodeId: 'derivatives' });
  const lines = learnerChangesSince(h.state, h.events, since);
  assert.deepEqual(lines, [
    'Set Limits to 62% (was 88%).',
    'Flagged Derivatives for review.',
    'Marked Derivatives as already known (now 80%).',
    'Reopened Derivatives for more practice.',
  ]);
  assert.deepEqual(learnerChangesSince(h.state, h.events, h.state.lastSeq), []);
});

test('learnerChangesSince summarizes quiz answers per quiz, with what was missed', () => {
  const h = teaching();
  const since = h.state.lastSeq;
  h.tutor({ type: 'give_quiz', items: QUIZ_ITEMS });
  const quizId = h.state.awaiting!.id;
  h.learner({ type: 'answer_quiz_item', quizId, itemId: 'q1', choice: 0 });
  h.learner({ type: 'answer_quiz_item', quizId, itemId: 'q2', choice: 2 });
  h.learner({ type: 'answer_quiz_item', quizId, itemId: 'q3', choice: 1 });
  h.learner({ type: 'adjust_mastery', nodeId: 'limits', setTo: 0.3 });
  assert.deepEqual(learnerChangesSince(h.state, h.events, since), [
    'Answered your quiz on Limits: 2 of 3 right. Missed: "lim x->1 of 2x?" (chose "3"; right answer "2").',
    'Set Limits to 30% (was 54%).',
  ]);
});

test('learnerChangesSince covers approvals, declines and closed cards', () => {
  const h = harness();
  h.tutor({ type: 'propose_plan', ...CALCULUS });
  h.learner({
    type: 'decline_plan',
    proposalId: h.state.proposal!.proposalId,
    feedback: 'Shorter',
  });
  h.tutor({ type: 'propose_plan', ...CALCULUS });
  h.learner({ type: 'approve_plan', proposalId: h.state.proposal!.proposalId });
  h.tutor({ type: 'give_quiz', items: QUIZ_ITEMS });
  h.learner({ type: 'dismiss_card', card: 'quiz', cardId: h.state.awaiting!.id });
  assert.deepEqual(learnerChangesSince(h.state, h.events, 0), [
    'Declined your plan proposal: "Shorter".',
    'Approved your plan proposal.',
    'Closed your quiz without finishing it.',
  ]);
  assert.equal(DEFAULT_TUTOR_FLAGS.planEditable, true);
});

test('once intake is answered, the block tells the tutor it may give starting estimates', () => {
  const h = harness();
  assert.doesNotMatch(render(h), /startingEstimate/);
  h.tutor({
    type: 'ask_intake',
    questions: [
      { question: 'Goal?', options: [{ label: 'Exam' }, { label: 'Fun' }] },
      { question: 'Background?', options: [{ label: 'Complete beginner' }, { label: 'Some' }] },
    ],
  });
  h.learner({
    type: 'answer_intake',
    intakeId: h.state.awaiting!.id,
    responses: { q1: ['Exam'], q2: ['Some'] },
  });
  assert.match(
    render(h),
    /Starting estimates: in propose_plan, give a startingEstimate \(up to 50%\) .* not to the topics built on it/,
  );
  h.tutor({ type: 'propose_plan', ...CALCULUS });
  assert.doesNotMatch(render(h), /Starting estimates/, 'not while a proposal waits');
});

test('the tutor remembers the latest questions asked on the current topic, and only that topic', () => {
  const h = harness();
  h.tutor({
    type: 'give_diagnostic',
    topic: 'Limits and derivatives',
    items: [
      { question: 'Diagnostic on limits?', choices: ['a', 'b'], correct: 0 },
      { question: 'Diagnostic on derivatives?', choices: ['a', 'b'], correct: 0 },
      { question: 'Another on derivatives?', choices: ['a', 'b'], correct: 1 },
    ],
  });
  const diagnosticId = h.state.awaiting!.id;
  h.learner({ type: 'answer_diagnostic', diagnosticId, answers: { q1: 0, q2: 0, q3: 0 } });
  h.tutor({ type: 'propose_plan', ...CALCULUS });
  h.learner({ type: 'approve_plan', proposalId: h.state.proposal!.proposalId });
  // Diagnostic items are tied to topics only once a plan exists, so this one names none.
  assert.doesNotMatch(render(h), /Card questions on this topic/);

  const quiz = (n: number) =>
    Array.from({ length: 4 }, (_, i) => ({
      question: `Quiz ${n} question ${i + 1}?`,
      choices: ['a', 'b'],
      correct: 0,
    }));
  h.tutor({ type: 'give_quiz', items: quiz(1) });
  const first = h.state.awaiting!.id;
  ['q1', 'q2', 'q3', 'q4'].forEach((itemId, i) =>
    h.learner({ type: 'answer_quiz_item', quizId: first, itemId, choice: i % 2 }),
  );
  h.tutor({ type: 'give_quiz', items: quiz(2).slice(0, 3) });
  h.learner({ type: 'answer_quiz_item', quizId: h.state.awaiting!.id, itemId: 'q1', choice: 1 });

  const block = render(h);
  const asked = block.split('\n').filter((line) => /^- ".*" \((quiz|diagnostic), /.test(line));
  assert.deepEqual(asked, [
    '- "Quiz 1 question 2?" (quiz, wrong)',
    '- "Quiz 1 question 3?" (quiz, right)',
    '- "Quiz 1 question 4?" (quiz, wrong)',
    '- "Quiz 2 question 1?" (quiz, wrong)',
    '- "Quiz 2 question 2?" (quiz, not answered)',
    '- "Quiz 2 question 3?" (quiz, not answered)',
  ]);
  assert.match(block, /^Card questions on this topic so far/m);

  // Moving on, the next topic starts with a clean slate.
  const open = h.state.awaiting!.id;
  h.learner({ type: 'answer_quiz_item', quizId: open, itemId: 'q2', choice: 0 });
  h.learner({ type: 'answer_quiz_item', quizId: open, itemId: 'q3', choice: 0 });
  master(h);
  h.tutor({ type: 'complete_topic', how: 'mastered' });
  h.tutor({ type: 'start_topic', nodeId: 'derivatives' });
  assert.doesNotMatch(render(h), /Card questions on this topic/);
});

test('diagnostic items tied to the current topic are remembered with their result', () => {
  const h = teaching();
  h.learner({ type: 'mark_known', nodeId: 'limits' });
  h.tutor({
    type: 'give_diagnostic',
    topic: 'Where you are',
    items: [
      {
        question: 'A derivative question?',
        choices: ['a', 'b'],
        correct: 0,
        nodeId: 'derivatives',
      },
      { question: 'A chain rule question?', choices: ['a', 'b'], correct: 0, nodeId: 'chain-rule' },
      {
        question: 'Another derivative question?',
        choices: ['a', 'b'],
        correct: 1,
        nodeId: 'derivatives',
      },
    ],
  });
  const diagnosticId = h.state.awaiting!.id;
  h.learner({ type: 'answer_diagnostic', diagnosticId, answers: { q1: 0, q2: 0, q3: 0 } });
  h.learner({ type: 'start_topic', nodeId: 'derivatives' });
  const block = render(h);
  assert.match(block, /^- "A derivative question\?" \(diagnostic, right\)$/m);
  assert.match(block, /^- "Another derivative question\?" \(diagnostic, wrong\)$/m);
  assert.doesNotMatch(block, /A chain rule question/);
});

test('the tutor is reminded of the answers it recorded on the current topic since it opened', () => {
  const h = teaching();
  assert.doesNotMatch(render(h), /What their answers on this topic/);
  const record = (kind: 'struggled' | 'applied', note: string, messageId: string) =>
    h.tutor({ type: 'record_evidence', kind, note, source: 'observation' }, messageId);
  record('struggled', 'Said the left side stays', 'r1');
  record('applied', 'Said equal midpoint means found', 'r2');
  h.tutor(
    {
      type: 'record_evidence',
      nodeId: 'derivatives',
      kind: 'applied',
      note: 'Elsewhere',
      source: 'observation',
    },
    'r2',
  );
  const block = render(h);
  assert.match(block, /What their answers on this topic have shown so far/);
  assert.match(
    block,
    /^- struggled: "Said the left side stays"\n- applied: "Said equal midpoint means found"$/m,
  );
  assert.doesNotMatch(block, /Elsewhere/, 'only the current topic');

  // A topic taken up again starts a fresh memory, like its quiz budget.
  h.learner({ type: 'adjust_mastery', nodeId: 'limits', setTo: 0.9 });
  h.tutor({ type: 'complete_topic', how: 'skipped' });
  h.learner({ type: 'reopen_topic', nodeId: 'limits' });
  assert.doesNotMatch(render(h), /What their answers on this topic/);
});

test('a diagnostic stays in view while teaching, with the wrong choices the learner picked', () => {
  const h = harness();
  h.tutor({
    type: 'give_diagnostic',
    topic: 'Adding fractions',
    items: [
      { question: '1/2 + 1/3?', choices: ['2/5', '5/6'], correct: 1 },
      { question: '1/4 + 1/6?', choices: ['2/10', '5/12'], correct: 1 },
      { question: '1/2 + 1/2?', choices: ['1', '2/4'], correct: 0 },
    ],
  });
  h.learner({
    type: 'answer_diagnostic',
    diagnosticId: h.state.awaiting!.id,
    answers: { q1: 0, q2: 0, q3: 0 },
  });
  h.tutor({ type: 'propose_plan', ...CALCULUS });
  h.learner({ type: 'approve_plan', proposalId: h.state.proposal!.proposalId });
  assert.equal(h.state.phase, 'teaching');
  assert.match(
    render(h),
    /^Diagnostic on "Adding fractions": 1 of 3 right\. Missed: "1\/2 \+ 1\/3\?" \(chose "2\/5"; right answer "5\/6"\); "1\/4 \+ 1\/6\?" \(chose "2\/10"; right answer "5\/12"\)\.$/m,
  );
});

test('the next topics are shown with their objectives, and finished ones drop out', () => {
  const h = teaching();
  assert.match(
    render(h),
    /^Coming up in the plan.*\n- Derivatives \[derivatives\]: Define the derivative; Apply the power rule\n- Chain rule \[chain-rule\]: Differentiate composite functions$/m,
  );
  master(h);
  h.tutor({ type: 'complete_topic', how: 'mastered' });
  h.tutor({ type: 'start_topic', nodeId: 'derivatives' });
  const block = render(h);
  assert.match(block, /^- Chain rule \[chain-rule\]: Differentiate composite functions$/m);
  assert.doesNotMatch(block, /^- Derivatives \[derivatives\]: Define/m);
});

test('a card from the last reply is reported once, in the learner changes, not again as an earlier question', () => {
  const h = teaching();
  const since = h.state.lastSeq;
  h.tutor({ type: 'give_quiz', items: QUIZ_ITEMS });
  const quizId = h.state.awaiting!.id;
  ['q1', 'q2', 'q3'].forEach((itemId) =>
    h.learner({ type: 'answer_quiz_item', quizId, itemId, choice: 0 }),
  );
  const changes = learnerChangesSince(h.state, h.events, since);
  assert.match(changes.join('\n'), /Answered your quiz on Limits: 1 of 3 right/);
  const block = renderStateBlock(h.state, { flags: h.flags, learnerChanges: changes, since });
  assert.doesNotMatch(block, /Card questions on this topic/);
  assert.equal(block.match(/lim x->1 of 2x/g)?.length, 1);

  // From the next reply on, it is part of the record.
  const later = renderStateBlock(h.state, { flags: h.flags, since: h.state.lastSeq });
  assert.match(later, /^- "lim x->1 of 2x\?" \(quiz, wrong\)$/m);
});

test('a diagnostic just answered is summed up once, in the learner changes', () => {
  const h = harness();
  const since = h.state.lastSeq;
  h.tutor({ type: 'give_diagnostic', topic: 'Algebra', items: QUIZ_ITEMS });
  h.learner({
    type: 'answer_diagnostic',
    diagnosticId: h.state.awaiting!.id,
    answers: { q1: 0, q2: 0, q3: 1 },
  });
  const changes = learnerChangesSince(h.state, h.events, since);
  const block = renderStateBlock(h.state, { flags: h.flags, learnerChanges: changes, since });
  assert.equal(block.match(/Diagnostic on "Algebra"/g)?.length, 1);
  assert.match(
    block,
    /^- Finished the diagnostic\. Diagnostic on "Algebra": 2 of 3 right\. Missed:/m,
  );
});

test('after the intake and before any diagnostic, the tutor is asked to see the learner try', () => {
  const h = harness();
  h.tutor({
    type: 'ask_intake',
    questions: [
      { question: 'Goal?', options: [{ label: 'Exam' }, { label: 'Fun' }] },
      { question: 'Background?', options: [{ label: 'Complete beginner' }, { label: 'Some' }] },
    ],
  });
  assert.doesNotMatch(render(h), /No diagnostic yet/, 'not before they answer');
  h.learner({
    type: 'answer_intake',
    intakeId: h.state.awaiting!.id,
    responses: { q1: ['Exam'], q2: ['Some'] },
  });
  assert.match(render(h), /^No diagnostic yet\. Unless they are new to the subject/m);
  h.tutor({ type: 'give_diagnostic', topic: 'Algebra', items: QUIZ_ITEMS });
  // While it is open: no call for another, and a way on if they would rather skip it.
  assert.doesNotMatch(render(h), /No diagnostic yet/);
  assert.match(render(h), /If they would rather skip it, don't wait: .*propose_plan/);
  h.learner({
    type: 'answer_diagnostic',
    diagnosticId: h.state.awaiting!.id,
    answers: { q1: 0, q2: 0, q3: 1 },
  });
  assert.doesNotMatch(render(h), /No diagnostic yet/);
});

test('while teaching, missed diagnostic picks come with a reminder to note the belief they share', () => {
  const h = harness();
  h.tutor({ type: 'give_diagnostic', topic: 'Algebra', items: QUIZ_ITEMS });
  h.learner({
    type: 'answer_diagnostic',
    diagnosticId: h.state.awaiting!.id,
    answers: { q1: 0, q2: 1, q3: 1 },
  });
  h.tutor({ type: 'propose_plan', ...CALCULUS });
  h.learner({ type: 'approve_plan', proposalId: h.state.proposal!.proposalId });
  assert.doesNotMatch(render(h), /A wrong belief those picks share/, 'nothing missed');

  const g = harness();
  g.tutor({ type: 'give_diagnostic', topic: 'Algebra', items: QUIZ_ITEMS });
  g.learner({
    type: 'answer_diagnostic',
    diagnosticId: g.state.awaiting!.id,
    answers: { q1: 0, q2: 0, q3: 1 },
  });
  g.tutor({ type: 'propose_plan', ...CALCULUS });
  g.learner({ type: 'approve_plan', proposalId: g.state.proposal!.proposalId });
  assert.match(render(g), /^A wrong belief those picks share is a misconception/m);
});
