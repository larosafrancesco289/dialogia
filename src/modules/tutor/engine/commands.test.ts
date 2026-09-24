import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  HELPED_FACTOR,
  MASTERY_PRIOR,
  MORE_PRACTICE_CAP,
  READY,
  decide,
  explainTopic,
  step,
  type TutorError,
  type TutorEvent,
} from '@/modules/tutor/engine';
import {
  CALCULUS,
  QUIZ_ITEMS,
  harness,
  master,
  teaching,
} from '@/modules/tutor/engine/testSupport';

const INTAKE = [
  {
    question: 'What is your goal?',
    options: [{ label: 'Pass an exam' }, { label: 'Curiosity' }],
  },
  {
    question: 'How much calculus have you done?',
    options: [{ label: 'Complete beginner' }, { label: 'Some' }, { label: 'Lots' }],
  },
];

const DIAGNOSTIC = [
  { question: 'd/dx x^2?', choices: ['x', '2x'], correct: 1 },
  { question: 'lim x->0 sin x / x?', choices: ['0', '1'], correct: 1 },
  { question: 'd/dx sin x?', choices: ['cos x', '-cos x'], correct: 0 },
];

function assertError(error: TutorError, code: TutorError['code'], pattern?: RegExp) {
  assert.equal(error.code, code, `${error.code}: ${error.message}`);
  assert.ok(error.message.length > 0);
  assert.ok(error.hint.length > 0);
  if (pattern) assert.match(`${error.message} ${error.hint}`, pattern);
}

const types = (events: TutorEvent[]) => events.map((e) => `${e.type}:${e.by}`);

describe('intake', () => {
  test('ask_intake opens an intake card with engine ids', () => {
    const h = harness();
    const [event] = h.tutor({ type: 'ask_intake', questions: INTAKE }, 'm1');
    assert.equal(event.type, 'intake_asked');
    assert.equal(event.messageId, 'm1');
    assert.equal(event.by, 'tutor');
    if (event.type !== 'intake_asked') return;
    assert.deepEqual(
      event.questions.map((q) => q.id),
      ['q1', 'q2'],
    );
    assert.deepEqual(h.state.awaiting, { kind: 'intake', id: event.intakeId });
    assert.equal(h.state.phase, 'intake');
  });

  test('ask_intake refuses bad shapes, an open card, and a plan that exists', () => {
    const h = harness();
    assertError(
      h.refuse({ by: 'tutor', type: 'ask_intake', questions: INTAKE.slice(0, 1) }),
      'invalid_arguments',
    );
    assertError(
      h.refuse({
        by: 'tutor',
        type: 'ask_intake',
        questions: [INTAKE[0], { question: 'Q', options: [{ label: 'only one' }] }],
      }),
      'invalid_arguments',
      /options/,
    );
    h.tutor({ type: 'ask_intake', questions: INTAKE });
    assertError(h.refuse({ by: 'tutor', type: 'ask_intake', questions: INTAKE }), 'card_open');
    assertError(
      teaching().refuse({ by: 'tutor', type: 'ask_intake', questions: INTAKE }),
      'wrong_phase',
    );
  });

  test('answer_intake records trimmed responses once', () => {
    const h = harness();
    h.tutor({ type: 'ask_intake', questions: INTAKE });
    const intakeId = h.state.awaiting!.id;
    assertError(
      h.refuse({ by: 'learner', type: 'answer_intake', intakeId: 'zzz', responses: {} }),
      'unknown_card',
    );
    assertError(
      h.refuse({ by: 'learner', type: 'answer_intake', intakeId, responses: { q9: ['x'] } }),
      'unknown_item',
      /q1, q2/,
    );
    assertError(
      h.refuse({ by: 'learner', type: 'answer_intake', intakeId, responses: { q1: ['  '] } }),
      'invalid_arguments',
    );
    h.learner({ type: 'answer_intake', intakeId, responses: { q1: [' Curiosity '], q2: [] } });
    assert.deepEqual(h.state.intakes[intakeId].responses, { q1: ['Curiosity'] });
    assert.equal(h.state.awaiting, undefined);
    assertError(
      h.refuse({ by: 'learner', type: 'answer_intake', intakeId, responses: { q1: ['x'] } }),
      'already_answered',
    );
  });
});

describe('diagnostics', () => {
  test('a pre-plan diagnostic is scored into the record but has no topic to move', () => {
    const h = harness();
    h.tutor({ type: 'give_diagnostic', topic: 'Calculus basics', items: DIAGNOSTIC });
    const diagnosticId = h.state.awaiting!.id;
    assert.equal(h.state.awaiting!.kind, 'diagnostic');
    const events = h.learner({
      type: 'answer_diagnostic',
      diagnosticId,
      answers: { q1: 1, q2: 0, q3: 0 },
    });
    assert.deepEqual(types(events), ['diagnostic_answered:learner']);
    assert.deepEqual(h.state.diagnostics[diagnosticId].answers, { q1: 1, q2: 0, q3: 0 });
  });

  test('with a plan, each scored item moves its topic by +0.3 / -0.2', () => {
    const h = teaching();
    h.tutor({ type: 'complete_topic', how: 'skipped' });
    assert.equal(h.state.phase, 'interlude');
    assertError(
      h.refuse({
        by: 'tutor',
        type: 'give_diagnostic',
        topic: 'x',
        items: DIAGNOSTIC.map((i) => ({ ...i, nodeId: 'nope' })),
      }),
      'unknown_node',
      /limits, derivatives, chain-rule/,
    );
    h.tutor({
      type: 'give_diagnostic',
      topic: 'Derivatives',
      items: DIAGNOSTIC.map((i) => ({ ...i, nodeId: 'derivatives' })),
    });
    const diagnosticId = h.state.awaiting!.id;
    assertError(
      h.refuse({ by: 'learner', type: 'answer_diagnostic', diagnosticId, answers: { q1: 1 } }),
      'incomplete_answers',
      /q2, q3/,
    );
    assertError(
      h.refuse({
        by: 'learner',
        type: 'answer_diagnostic',
        diagnosticId,
        answers: { q1: 1, q2: 1, q3: 7 },
      }),
      'invalid_choice',
    );
    assertError(
      h.refuse({
        by: 'learner',
        type: 'answer_diagnostic',
        diagnosticId,
        answers: { q1: 1, q2: 1, q3: 0, q4: 0 },
      }),
      'unknown_item',
    );
    const events = h.learner({
      type: 'answer_diagnostic',
      diagnosticId,
      answers: { q1: 1, q2: 1, q3: 1 },
    });
    assert.deepEqual(types(events), [
      'diagnostic_answered:learner',
      'evidence_recorded:system',
      'evidence_recorded:system',
      'evidence_recorded:system',
    ]);
    const weights = events.flatMap((e) => (e.type === 'evidence_recorded' ? [e.weight] : []));
    assert.deepEqual(weights, [0.3, 0.3, -0.2]);
    const expected = [0.3, 0.3, -0.2].reduce(
      (c, w) => (w > 0 ? c + w * (1 - c) : c + w * c),
      MASTERY_PRIOR,
    );
    assert.equal(h.state.mastery.derivatives.confidence, expected);
    assertError(
      h.refuse({
        by: 'learner',
        type: 'answer_diagnostic',
        diagnosticId,
        answers: { q1: 1, q2: 1, q3: 1 },
      }),
      'already_answered',
    );
  });

  test('diagnostics are budgeted per session and blocked while teaching', () => {
    const h = harness();
    for (let i = 0; i < 2; i += 1) {
      h.tutor({ type: 'give_diagnostic', topic: 't', items: DIAGNOSTIC });
      h.learner({ type: 'dismiss_card', card: 'diagnostic', cardId: h.state.awaiting!.id });
    }
    assertError(
      h.refuse({ by: 'tutor', type: 'give_diagnostic', topic: 't', items: DIAGNOSTIC }),
      'budget_exhausted',
    );
    assertError(
      teaching().refuse({ by: 'tutor', type: 'give_diagnostic', topic: 't', items: DIAGNOSTIC }),
      'wrong_phase',
    );
    assertError(
      harness().refuse({
        by: 'tutor',
        type: 'give_diagnostic',
        topic: 't',
        items: DIAGNOSTIC.slice(0, 2),
      }),
      'invalid_arguments',
    );
  });
});

describe('plans', () => {
  test('propose, then approve: the first ready topic starts', () => {
    const h = harness();
    const [proposed] = h.tutor({ type: 'propose_plan', ...CALCULUS, rationale: 'Build up' });
    assert.equal(h.state.phase, 'proposal');
    assert.ok(proposed.type === 'plan_proposed' && !proposed.revision);
    const proposalId = h.state.proposal!.proposalId;
    const events = h.learner({ type: 'approve_plan', proposalId });
    assert.deepEqual(types(events), ['plan_approved:learner', 'topic_started:system']);
    assert.equal(h.state.phase, 'teaching');
    assert.equal(h.state.currentNodeId, 'limits');
    assert.deepEqual(Object.keys(h.state.mastery), ['limits', 'derivatives', 'chain-rule']);
    assert.ok(Object.values(h.state.mastery).every((m) => m.confidence === MASTERY_PRIOR));
  });

  test('starting estimates become visible, contestable evidence when the plan is approved', () => {
    const h = harness();
    h.tutor({
      type: 'propose_plan',
      goal: CALCULUS.goal,
      nodes: [
        {
          ...CALCULUS.nodes[0],
          startingEstimate: { value: 0.6, reason: 'Said they evaluate limits at work' },
        },
        { ...CALCULUS.nodes[1], startingEstimate: { value: 0.95, reason: 'Claims mastery' } },
        CALCULUS.nodes[2],
      ],
    });
    assert.ok(!('limits' in h.state.mastery), 'nothing moves before approval');
    const events = h.learner({ type: 'approve_plan', proposalId: h.state.proposal!.proposalId });
    assert.deepEqual(types(events), [
      'plan_approved:learner',
      'evidence_recorded:system',
      'evidence_recorded:system',
      'topic_started:system',
    ]);
    const limits = h.state.mastery.limits;
    assert.equal(limits.confidence, 0.6);
    assert.equal(limits.evidence[0].source, 'placement');
    assert.equal(limits.evidence[0].kind, 'placement');
    assert.equal(limits.evidence[0].details, 'Said they evaluate limits at work');
    assert.equal(
      h.state.mastery.derivatives.confidence,
      READY - 0.05,
      'capped below READY, so the tutor still checks it',
    );
    assert.equal(h.state.mastery['chain-rule'].confidence, MASTERY_PRIOR);
    const why = explainTopic(h.state, 'limits')!;
    assert.equal(why.confidence, 0.6);
    assert.match(why.steps[0].text, /Starting estimate: Said they evaluate limits/);

    // Contestable like any estimate.
    h.learner({ type: 'adjust_mastery', nodeId: 'limits', setTo: 0.45 });
    assert.equal(h.state.mastery.limits.confidence, 0.45);
  });

  test('after a diagnostic, starting estimates are recorded as diagnostic evidence', () => {
    const h = harness();
    h.tutor({ type: 'give_diagnostic', topic: 'Calculus basics', items: DIAGNOSTIC });
    h.learner({
      type: 'answer_diagnostic',
      diagnosticId: h.state.awaiting!.id,
      answers: { q1: 1, q2: 1, q3: 0 },
    });
    h.tutor({
      type: 'propose_plan',
      goal: CALCULUS.goal,
      nodes: [
        { ...CALCULUS.nodes[0], startingEstimate: { value: 0.7, reason: 'Got the limit right' } },
        CALCULUS.nodes[1],
        CALCULUS.nodes[2],
      ],
    });
    h.learner({ type: 'approve_plan', proposalId: h.state.proposal!.proposalId });
    const [entry] = h.state.mastery.limits.evidence;
    assert.equal(entry.source, 'diagnostic');
    assert.equal(entry.details, 'Starting estimate from the diagnostic: Got the limit right');
    assert.equal(h.state.mastery.limits.confidence, 0.7);
  });

  test('a revision leaves topics with evidence of their own alone', () => {
    const h = teaching();
    master(h);
    const earned = h.state.mastery.limits.confidence;
    h.tutor({
      type: 'propose_plan',
      goal: CALCULUS.goal,
      nodes: [
        { ...CALCULUS.nodes[0], startingEstimate: { value: 0.4, reason: 'Guess' } },
        { ...CALCULUS.nodes[1], startingEstimate: { value: 0.5, reason: 'Guess' } },
        CALCULUS.nodes[2],
      ],
    });
    h.learner({ type: 'approve_plan', proposalId: h.state.proposal!.proposalId });
    assert.equal(h.state.mastery.limits.confidence, earned);
    assert.equal(h.state.mastery.derivatives.confidence, 0.5);
  });

  test('invalid plans come back with every problem', () => {
    const h = harness();
    const error = h.refuse({
      by: 'tutor',
      type: 'propose_plan',
      goal: ' ',
      nodes: [{ id: 'a', name: 'A', objectives: ['x'], prerequisites: ['a', 'ghost'] }],
    });
    assertError(error, 'invalid_plan');
    assert.match(error.message, /goal/);
    assert.match(error.message, /itself/);
    assert.match(error.message, /"ghost"/);
  });

  test('a newer proposal supersedes; approving the old one is stale', () => {
    const h = harness();
    h.tutor({ type: 'propose_plan', ...CALCULUS });
    const old = h.state.proposal!.proposalId;
    h.tutor({ type: 'propose_plan', ...CALCULUS, goal: 'Better goal' });
    assertError(
      h.refuse({ by: 'learner', type: 'approve_plan', proposalId: old }),
      'stale_proposal',
    );
    assertError(
      harness().refuse({ by: 'learner', type: 'approve_plan', proposalId: old }),
      'no_proposal',
    );
  });

  test('decline returns to intake and remembers the feedback, unless the plan is locked', () => {
    const h = harness();
    h.tutor({ type: 'propose_plan', ...CALCULUS });
    const proposalId = h.state.proposal!.proposalId;
    assertError(
      harness({ planEditable: false }).refuse({ by: 'learner', type: 'decline_plan', proposalId }),
      'no_proposal',
    );
    const locked = harness({ planEditable: false });
    locked.tutor({ type: 'propose_plan', ...CALCULUS });
    assertError(
      locked.refuse({
        by: 'learner',
        type: 'decline_plan',
        proposalId: locked.state.proposal!.proposalId,
      }),
      'not_editable',
    );
    h.learner({ type: 'decline_plan', proposalId, feedback: ' Too long ' });
    assert.equal(h.state.phase, 'intake');
    assert.deepEqual(h.state.lastDeclined, { proposalId, feedback: 'Too long' });
  });

  test('mid-topic revisions need an editable plan; an open card blocks proposals', () => {
    assertError(
      teaching({ planEditable: false }).refuse({ by: 'tutor', type: 'propose_plan', ...CALCULUS }),
      'not_editable',
    );
    const h = teaching();
    h.tutor({ type: 'give_quiz', items: QUIZ_ITEMS });
    assertError(h.refuse({ by: 'tutor', type: 'propose_plan', ...CALCULUS }), 'card_open');
    h.learner({ type: 'dismiss_card', card: 'quiz', cardId: h.state.awaiting!.id });
    h.tutor({ type: 'propose_plan', ...CALCULUS });
    assert.equal(h.state.phase, 'proposal');
  });

  test('a revision keeps mastery and completion for surviving ids and starts nothing new while one is in progress', () => {
    const h = teaching();
    master(h);
    h.tutor({ type: 'complete_topic', how: 'mastered' });
    h.learner({ type: 'start_topic', nodeId: 'derivatives' });
    h.tutor({
      type: 'record_evidence',
      kind: 'applied',
      note: 'Used the power rule',
      source: 'observation',
    });
    const limits = h.state.mastery.limits;
    const derivatives = h.state.mastery.derivatives;

    h.tutor({
      type: 'propose_plan',
      goal: 'Differentiate anything',
      nodes: [
        { id: 'limits', name: 'Limits', objectives: ['x'] },
        { id: 'derivatives', name: 'Derivatives', objectives: ['x'], prerequisites: ['limits'] },
        { name: 'Implicit differentiation', objectives: ['x'], prerequisites: ['derivatives'] },
      ],
    });
    assert.ok(h.state.proposal?.revision);
    const events = h.learner({ type: 'approve_plan', proposalId: h.state.proposal!.proposalId });
    assert.deepEqual(types(events), ['plan_approved:learner']);

    const plan = h.state.plan!;
    assert.deepEqual(
      plan.nodes.map((n) => [n.id, n.status]),
      [
        ['limits', 'completed'],
        ['derivatives', 'in_progress'],
        ['implicit-differentiation', 'not_started'],
      ],
    );
    assert.equal(plan.nodes[0].completedHow, 'mastered');
    assert.equal(plan.version, 2);
    assert.deepEqual(h.state.mastery.limits, limits);
    assert.deepEqual(h.state.mastery.derivatives, derivatives);
    assert.equal(h.state.mastery['implicit-differentiation'].confidence, MASTERY_PRIOR);
    assert.equal(h.state.mastery['chain-rule'], undefined, 'removed topics drop out');
    assert.equal(h.state.phase, 'teaching');
  });

  test('status at approval wins over status at proposal time', () => {
    const h = teaching();
    h.tutor({ type: 'propose_plan', ...CALCULUS, goal: 'Same, reworded' });
    h.learner({ type: 'skip_topic', nodeId: 'limits' });
    h.learner({ type: 'approve_plan', proposalId: h.state.proposal!.proposalId });
    assert.equal(h.state.plan!.nodes[0].status, 'completed');
    assert.equal(
      h.state.currentNodeId,
      'derivatives',
      'nothing was in progress, so the next ready topic starts',
    );
  });
});

describe('quizzes', () => {
  test('give_quiz targets the current topic with engine item ids', () => {
    const h = teaching();
    const [event] = h.tutor({ type: 'give_quiz', title: 'Limits', items: QUIZ_ITEMS }, 'm2');
    assert.ok(event.type === 'quiz_given');
    assert.equal(event.nodeId, 'limits');
    assert.deepEqual(
      event.items.map((i) => i.id),
      ['q1', 'q2', 'q3'],
    );
    assert.deepEqual(h.state.awaiting, { kind: 'quiz', id: event.quizId });
    assertError(h.refuse({ by: 'tutor', type: 'give_quiz', items: QUIZ_ITEMS }), 'card_open');
  });

  test('give_quiz refuses bad items and the wrong phase', () => {
    const h = teaching();
    assertError(
      h.refuse({
        by: 'tutor',
        type: 'give_quiz',
        items: [{ question: 'q', choices: ['a', 'b'], correct: 2 }],
      }),
      'invalid_arguments',
      /0 to 1/,
    );
    assertError(
      h.refuse({ by: 'tutor', type: 'give_quiz', items: Array(6).fill(QUIZ_ITEMS[0]) }),
      'invalid_arguments',
    );
    assertError(
      harness().refuse({ by: 'tutor', type: 'give_quiz', items: QUIZ_ITEMS }),
      'wrong_phase',
    );
  });

  test('each answer is graded exactly once, into exactly one piece of evidence', () => {
    const h = teaching();
    h.tutor({ type: 'give_quiz', items: QUIZ_ITEMS });
    const quizId = h.state.awaiting!.id;
    const right = h.learner({ type: 'answer_quiz_item', quizId, itemId: 'q1', choice: 0 });
    assert.deepEqual(types(right), ['quiz_answered:learner', 'evidence_recorded:system']);
    const [answered, evidence] = right;
    assert.ok(answered.type === 'quiz_answered' && answered.correct);
    assert.ok(evidence.type === 'evidence_recorded');
    assert.equal(evidence.source, 'quiz');
    assert.equal(evidence.weight, 0.4);
    assert.deepEqual(evidence.ref, { quizId, itemId: 'q1' });
    assert.equal(h.state.mastery.limits.confidence, 0.3 + 0.4 * 0.7);

    assertError(
      h.refuse({ by: 'learner', type: 'answer_quiz_item', quizId, itemId: 'q1', choice: 1 }),
      'already_answered',
    );
    const wrong = h.learner({ type: 'answer_quiz_item', quizId, itemId: 'q2', choice: 0 });
    assert.ok(wrong[1].type === 'evidence_recorded' && wrong[1].weight === -0.3);

    const quizEvidence = h.state.mastery.limits.evidence.filter((e) => e.source === 'quiz');
    assert.equal(quizEvidence.length, 2);
    assert.equal(h.state.awaiting?.kind, 'quiz', 'still one item to go');
    h.learner({ type: 'answer_quiz_item', quizId, itemId: 'q3', choice: 1 });
    assert.equal(h.state.awaiting, undefined);
    assert.equal(h.state.mastery.limits.evidence.filter((e) => e.source === 'quiz').length, 3);
  });

  test('answer_quiz_item refuses unknown quizzes, items and choices, and closed quizzes', () => {
    const h = teaching();
    h.tutor({ type: 'give_quiz', items: QUIZ_ITEMS });
    const quizId = h.state.awaiting!.id;
    assertError(
      h.refuse({
        by: 'learner',
        type: 'answer_quiz_item',
        quizId: 'nope',
        itemId: 'q1',
        choice: 0,
      }),
      'unknown_card',
    );
    assertError(
      h.refuse({ by: 'learner', type: 'answer_quiz_item', quizId, itemId: 'q9', choice: 0 }),
      'unknown_item',
      /q1, q2, q3/,
    );
    assertError(
      h.refuse({ by: 'learner', type: 'answer_quiz_item', quizId, itemId: 'q1', choice: 5 }),
      'invalid_choice',
    );
    h.learner({ type: 'dismiss_card', card: 'quiz', cardId: quizId });
    assertError(
      h.refuse({ by: 'learner', type: 'answer_quiz_item', quizId, itemId: 'q1', choice: 0 }),
      'card_closed',
    );
    assertError(
      h.refuse({ by: 'learner', type: 'dismiss_card', card: 'quiz', cardId: quizId }),
      'card_closed',
    );
  });

  test('three quizzes per topic, counted from events and reset by a reopen', () => {
    const h = teaching();
    for (let i = 0; i < 3; i += 1) {
      h.tutor({ type: 'give_quiz', items: QUIZ_ITEMS.slice(0, 1) });
      h.learner({
        type: 'answer_quiz_item',
        quizId: h.state.awaiting!.id,
        itemId: 'q1',
        choice: 0,
      });
    }
    assertError(
      h.refuse({ by: 'tutor', type: 'give_quiz', items: QUIZ_ITEMS }),
      'budget_exhausted',
    );
    h.learner({ type: 'adjust_mastery', nodeId: 'limits', setTo: 0.9 });
    h.tutor({ type: 'complete_topic', how: 'mastered' });
    h.learner({ type: 'reopen_topic', nodeId: 'limits' });
    assert.equal(h.state.currentNodeId, 'limits');
    h.tutor({ type: 'give_quiz', items: QUIZ_ITEMS.slice(0, 1) });
  });
});

describe('evidence and misconceptions', () => {
  test('record_evidence counts a step the tutor led them to for less, and never softens a struggle', () => {
    const h = teaching();
    const [a] = h.tutor({
      type: 'record_evidence',
      kind: 'applied',
      helped: true,
      note: 'Subtracted 5 once I named the step',
      source: 'observation',
    });
    assert.ok(
      a.type === 'evidence_recorded' && Math.abs((a.weight ?? 0) - 0.3 * HELPED_FACTOR) < 1e-9,
    );
    const [b] = h.tutor({
      type: 'record_evidence',
      kind: 'struggled',
      helped: true,
      note: 'Stuck even with a hint',
      source: 'observation',
    });
    assert.ok(b.type === 'evidence_recorded' && b.weight === -0.2);
  });

  test('record_evidence uses per-kind defaults, checks direction, and clamps', () => {
    const h = teaching();
    const [a] = h.tutor({
      type: 'record_evidence',
      kind: 'explained',
      note: 'Explained it back',
      source: 'observation',
    });
    assert.ok(a.type === 'evidence_recorded' && a.weight === 0.2);
    const [b] = h.tutor({
      type: 'record_evidence',
      kind: 'struggled',
      note: 'Stuck',
      source: 'observation',
    });
    assert.ok(b.type === 'evidence_recorded' && b.weight === -0.2);
    const [c] = h.tutor({
      type: 'record_evidence',
      kind: 'insight',
      weight: 3,
      note: 'Wow',
      source: 'observation',
    });
    assert.ok(c.type === 'evidence_recorded' && c.weight === 0.7);
    assertError(
      h.refuse({
        by: 'tutor',
        type: 'record_evidence',
        kind: 'struggled',
        weight: 0.3,
        note: 'x',
        source: 'observation',
      }),
      'invalid_arguments',
      /negative/,
    );
    assertError(
      h.refuse({
        by: 'tutor',
        type: 'record_evidence',
        kind: 'applied',
        note: ' ',
        source: 'observation',
      }),
      'invalid_arguments',
    );
    assertError(
      h.refuse({
        by: 'tutor',
        type: 'record_evidence',
        nodeId: 'ghost',
        kind: 'applied',
        note: 'n',
        source: 'observation',
      }),
      'unknown_node',
      /valid topic ids: limits, derivatives, chain-rule/,
    );
    const [loose] = h.tutor({
      type: 'record_evidence',
      nodeId: 'Chain_Rule',
      kind: 'partial',
      note: 'n',
      source: 'observation',
    });
    assert.ok(loose.type === 'evidence_recorded' && loose.nodeId === 'chain-rule');
  });

  test('learner_said may set the estimate, only when the learner model is editable', () => {
    const h = teaching();
    const cmd = {
      by: 'tutor' as const,
      type: 'record_evidence' as const,
      kind: 'partial' as const,
      note: 'Says they are shaky',
      source: 'learner_said' as const,
      setTo: 0.2,
    };
    assertError(
      teaching({ learnerModelEditable: false }).refuse(cmd),
      'not_editable',
      /without setTo/,
    );
    h.tutor(cmd);
    assert.equal(h.state.mastery.limits.confidence, 0.2);
  });

  test('setTo on an observation does not apply, so it is ignored rather than refused', () => {
    const h = teaching();
    const [event] = h.tutor({
      type: 'record_evidence',
      kind: 'applied',
      note: 'Solved one alone',
      source: 'observation',
      setTo: 0,
    });
    assert.ok(event.type === 'evidence_recorded');
    assert.equal(event.setTo, undefined);
    assert.equal(event.weight, 0.3);
    assert.ok(h.state.mastery.limits.confidence > MASTERY_PRIOR);
  });

  test('a weight against its kind is refused with the fields and values to change', () => {
    const h = teaching();
    assertError(
      h.refuse({
        by: 'tutor',
        type: 'record_evidence',
        kind: 'applied',
        note: 'n',
        source: 'observation',
        weight: -0.2,
      }),
      'invalid_arguments',
      /Change weight to a number from 0 to 0\.7.*change kind to struggled/,
    );
    assertError(
      h.refuse({
        by: 'tutor',
        type: 'record_evidence',
        kind: 'struggled',
        note: 'n',
        source: 'observation',
        weight: 0.2,
      }),
      'invalid_arguments',
      /from -0\.5 to 0.*explained, applied, insight, partial/,
    );
  });

  test('in the interlude, evidence needs an explicit topic', () => {
    const h = teaching();
    h.tutor({ type: 'complete_topic', how: 'skipped' });
    assertError(
      h.refuse({
        by: 'tutor',
        type: 'record_evidence',
        kind: 'applied',
        note: 'n',
        source: 'observation',
      }),
      'no_current_topic',
      /limits, derivatives/,
    );
    h.tutor({
      type: 'record_evidence',
      nodeId: 'limits',
      kind: 'applied',
      note: 'n',
      source: 'observation',
    });
  });

  test('misconceptions: noted with a readable id, counted, resolved once', () => {
    const h = teaching();
    const [first] = h.tutor({
      type: 'note_misconception',
      description: 'Thinks a limit is the value at the point',
    });
    assert.ok(first.type === 'misconception_noted');
    assert.equal(first.misconceptionId, 'thinks-a-limit-is-the-value-at-the-point');
    const [again] = h.tutor({
      type: 'note_misconception',
      description: 'thinks a limit is the value at the point ',
    });
    assert.ok(
      again.type === 'misconception_noted' && again.misconceptionId === first.misconceptionId,
    );
    assert.equal(h.state.mastery.limits.misconceptions[0].occurrences, 2);

    assertError(
      h.refuse({ by: 'tutor', type: 'resolve_misconception', misconceptionId: 'nope' }),
      'unknown_misconception',
      /thinks-a-limit/,
    );
    h.tutor({ type: 'resolve_misconception', misconceptionId: first.misconceptionId });
    assert.equal(h.state.mastery.limits.misconceptions[0].resolvedBy, 'tutor');
    assert.deepEqual(
      h.decide({
        by: 'tutor',
        type: 'resolve_misconception',
        misconceptionId: first.misconceptionId,
      }),
      { ok: true, events: [] },
      'resolving a resolved misconception is accepted and changes nothing',
    );
    h.tutor({
      type: 'note_misconception',
      description: 'Thinks a limit is the value at the point',
    });
    assert.equal(
      h.state.mastery.limits.misconceptions[0].resolved,
      false,
      'noting again reopens it',
    );
    assertError(
      teaching({ learnerModelEditable: false }).refuse({
        by: 'learner',
        type: 'resolve_misconception',
        misconceptionId: 'x',
      }),
      'not_editable',
    );
    h.learner({ type: 'resolve_misconception', misconceptionId: first.misconceptionId });
    assert.equal(h.state.mastery.limits.misconceptions[0].resolvedBy, 'learner');
  });
});

describe('topics and phases', () => {
  test('complete_topic as mastered needs READY and no open misconceptions', () => {
    const h = teaching();
    const low = h.refuse({ by: 'tutor', type: 'complete_topic', how: 'mastered' });
    assertError(low, 'not_ready', /30%.*80%/);
    assert.match(low.hint, /skipped/);
    assert.doesNotMatch(
      teaching({ planEditable: false }).refuse({
        by: 'tutor',
        type: 'complete_topic',
        how: 'mastered',
      }).hint,
      /skipped/,
    );
    master(h);
    assert.ok(h.state.mastery.limits.confidence >= READY);
    h.tutor({ type: 'note_misconception', description: 'Confuses left and right limits' });
    assertError(
      h.refuse({ by: 'tutor', type: 'complete_topic', how: 'mastered' }),
      'open_misconceptions',
      /confuses-left-and-right-limits/,
    );
    assertError(
      h.refuse({ by: 'tutor', type: 'complete_topic', nodeId: 'derivatives', how: 'mastered' }),
      'topic_not_current',
    );
    assertError(
      teaching({ planEditable: false }).refuse({
        by: 'tutor',
        type: 'complete_topic',
        how: 'skipped',
      }),
      'not_editable',
    );
  });

  test('mastered needs two pieces of the learner’s own work, not a starting estimate and one answer', () => {
    const h = harness();
    h.tutor({
      type: 'propose_plan',
      ...CALCULUS,
      nodes: CALCULUS.nodes.map((node, i) =>
        i === 0 ? { ...node, startingEstimate: { value: 0.75, reason: 'Said so' } } : node,
      ),
    });
    h.learner({ type: 'approve_plan', proposalId: h.state.proposal!.proposalId });
    h.tutor({ type: 'give_quiz', items: QUIZ_ITEMS.slice(0, 1) });
    h.learner({ type: 'answer_quiz_item', quizId: h.state.awaiting!.id, itemId: 'q1', choice: 0 });
    assert.ok(h.state.mastery.limits.confidence >= READY, 'high enough on the number alone');

    const thin = h.refuse({ by: 'tutor', type: 'complete_topic', how: 'mastered' });
    assertError(thin, 'not_ready', /only 1 of the 2 pieces of evidence/);
    assert.match(thin.hint, /1 more/);
    assert.match(thin.hint, /give_quiz|record_evidence/);

    // A learner's own correction is theirs to make, but it is not evidence of mastery.
    h.learner({ type: 'adjust_mastery', nodeId: 'limits', setTo: 0.95 });
    assertError(h.refuse({ by: 'tutor', type: 'complete_topic', how: 'mastered' }), 'not_ready');

    h.tutor({
      type: 'record_evidence',
      kind: 'applied',
      note: 'Solved one alone',
      source: 'observation',
    });
    h.tutor({ type: 'complete_topic', how: 'mastered' });
    assert.equal(h.state.phase, 'interlude');
    // Skipping is the learner's call and needs no evidence.
    const skip = teaching();
    skip.tutor({ type: 'complete_topic', how: 'skipped' });
    assert.equal(skip.state.plan!.nodes[0].completedHow, 'skipped');
  });

  test('the reply that completes a topic cannot start the next: the learner chooses', () => {
    const h = teaching();
    master(h);
    h.tutor({ type: 'complete_topic', how: 'mastered' }, 'reply-1');
    const same = decide(
      h.state,
      { by: 'tutor', type: 'start_topic', nodeId: 'derivatives' },
      h.ctx('reply-1'),
    );
    assert.equal(same.ok, false);
    const error = (same as { ok: false; error: TutorError }).error;
    assertError(error, 'learner_chooses', /same reply/);
    assert.match(error.hint, /chapter break/);
    assert.match(error.hint, /closing line/);
    assert.equal(h.state.phase, 'interlude');

    // A later reply, say after the learner types "let's go on", may start it.
    h.tutor({ type: 'start_topic', nodeId: 'derivatives' }, 'reply-2');
    assert.equal(h.state.currentNodeId, 'derivatives');
  });

  test('the full arc: intake, proposal, teaching, interlude, complete, and re-planning after', () => {
    const h = harness();
    assert.equal(h.state.phase, 'intake');
    h.tutor({ type: 'propose_plan', ...CALCULUS });
    assert.equal(h.state.phase, 'proposal');
    h.learner({ type: 'approve_plan', proposalId: h.state.proposal!.proposalId });
    assert.equal(h.state.phase, 'teaching');

    master(h);
    h.tutor({ type: 'complete_topic', how: 'mastered', note: 'Solid' });
    assert.equal(h.state.phase, 'interlude', 'completing never starts the next topic');
    assert.equal(h.state.currentNodeId, undefined);
    assert.equal(h.state.plan!.nodes[1].status, 'not_started');
    assertError(
      h.refuse({ by: 'tutor', type: 'give_quiz', items: QUIZ_ITEMS }),
      'wrong_phase',
      /start_topic/,
    );

    assertError(
      h.refuse({ by: 'tutor', type: 'start_topic', nodeId: 'chain-rule' }),
      'prerequisites_unmet',
      /Ready to start now: derivatives/,
    );
    h.tutor({ type: 'start_topic', nodeId: 'derivatives' });
    assert.equal(h.state.phase, 'teaching');
    h.learner({ type: 'mark_known', nodeId: 'derivatives' });
    assert.equal(h.state.phase, 'interlude');
    h.learner({ type: 'start_topic', nodeId: 'chain-rule' });
    h.learner({ type: 'skip_topic', nodeId: 'chain-rule' });
    assert.equal(h.state.phase, 'complete');
    assertError(h.refuse({ by: 'learner', type: 'start_topic', nodeId: 'limits' }), 'wrong_phase');
    assertError(
      h.refuse({
        by: 'tutor',
        type: 'record_evidence',
        nodeId: 'limits',
        kind: 'applied',
        note: 'n',
        source: 'observation',
      }),
      'wrong_phase',
    );

    h.tutor({
      type: 'propose_plan',
      goal: 'Go further',
      nodes: [
        { id: 'limits', name: 'Limits', objectives: ['x'] },
        { id: 'derivatives', name: 'Derivatives', objectives: ['x'] },
        { id: 'chain-rule', name: 'Chain rule', objectives: ['x'] },
        { name: 'Related rates', objectives: ['x'], prerequisites: ['chain-rule'] },
      ],
    });
    assert.equal(h.state.phase, 'proposal');
    h.learner({ type: 'approve_plan', proposalId: h.state.proposal!.proposalId });
    assert.equal(h.state.phase, 'teaching');
    assert.equal(h.state.currentNodeId, 'related-rates');
    assert.equal(h.state.plan!.nodes.filter((n) => n.status === 'completed').length, 3);
  });

  test('start_topic refusals', () => {
    const h = teaching();
    assertError(
      h.refuse({ by: 'tutor', type: 'start_topic', nodeId: 'ghost' }),
      'unknown_node',
      /limits/,
    );
    assert.deepEqual(
      h.decide({ by: 'tutor', type: 'start_topic', nodeId: 'limits' }),
      { ok: true, events: [] },
      'the tutor starting the topic in progress is accepted and changes nothing',
    );
    assertError(
      h.refuse({ by: 'learner', type: 'start_topic', nodeId: 'limits' }),
      'already_current',
    );
    assertError(
      teaching({ planEditable: false }).refuse({
        by: 'tutor',
        type: 'start_topic',
        nodeId: 'derivatives',
      }),
      'not_editable',
    );
    assertError(
      teaching({ planEditable: false }).refuse({
        by: 'learner',
        type: 'start_topic',
        nodeId: 'derivatives',
      }),
      'not_editable',
    );
    h.learner({ type: 'skip_topic', nodeId: 'limits' });
    assertError(
      h.refuse({ by: 'learner', type: 'start_topic', nodeId: 'limits' }),
      'topic_completed',
      /Reopen/,
    );
    assertError(
      harness().refuse({ by: 'learner', type: 'start_topic', nodeId: 'limits' }),
      'wrong_phase',
    );
  });

  test('a jump mid-topic pauses the current topic', () => {
    const h = teaching();
    h.learner({ type: 'skip_topic', nodeId: 'limits' });
    h.learner({ type: 'start_topic', nodeId: 'derivatives' });
    h.learner({ type: 'reopen_topic', nodeId: 'limits' });
    assert.equal(h.state.currentNodeId, 'limits');
    assert.equal(h.state.plan!.nodes[1].status, 'not_started');
    assert.equal(h.state.plan!.nodes[0].completedHow, undefined);
    assertError(
      h.refuse({ by: 'learner', type: 'reopen_topic', nodeId: 'derivatives' }),
      'topic_not_completed',
    );
  });
});

describe('learner controls', () => {
  test('mark_known floors at READY, never lowers, and completes as known', () => {
    const h = teaching();
    const events = h.learner({ type: 'mark_known', nodeId: 'limits' });
    assert.deepEqual(types(events), ['evidence_recorded:learner', 'topic_completed:learner']);
    assert.equal(h.state.mastery.limits.confidence, READY);
    assert.equal(h.state.plan!.nodes[0].completedHow, 'known');
    assertError(
      h.refuse({ by: 'learner', type: 'mark_known', nodeId: 'limits' }),
      'topic_completed',
    );

    const high = teaching();
    high.learner({ type: 'adjust_mastery', nodeId: 'derivatives', setTo: 0.95 });
    const noFloor = high.learner({ type: 'mark_known', nodeId: 'derivatives' });
    assert.deepEqual(types(noFloor), ['topic_completed:learner']);
    assert.equal(high.state.mastery.derivatives.confidence, 0.95);
  });

  test('mark_known respects both flags', () => {
    assertError(
      teaching({ planEditable: false }).refuse({
        by: 'learner',
        type: 'mark_known',
        nodeId: 'limits',
      }),
      'not_editable',
    );
    const readOnlyModel = teaching({ learnerModelEditable: false });
    const events = readOnlyModel.learner({ type: 'mark_known', nodeId: 'limits' });
    assert.deepEqual(types(events), ['topic_completed:learner']);
    assert.equal(readOnlyModel.state.mastery.limits.confidence, MASTERY_PRIOR);
  });

  test('skip and reopen need an editable plan', () => {
    const locked = teaching({ planEditable: false });
    assertError(
      locked.refuse({ by: 'learner', type: 'skip_topic', nodeId: 'limits' }),
      'not_editable',
    );
    assertError(
      locked.refuse({ by: 'learner', type: 'reopen_topic', nodeId: 'limits' }),
      'not_editable',
    );
    const h = teaching();
    h.learner({ type: 'skip_topic', nodeId: 'limits' });
    assert.equal(h.state.plan!.nodes[0].completedHow, 'skipped');
    assertError(
      h.refuse({ by: 'learner', type: 'skip_topic', nodeId: 'limits' }),
      'topic_completed',
    );
  });

  test('mastered counts only correct work, and only since the topic was last reopened', () => {
    // Two mistakes are evidence, but not of mastery.
    const h = teaching();
    h.tutor({
      type: 'record_evidence',
      kind: 'struggled',
      note: 'Sign slip',
      source: 'observation',
    });
    h.tutor({ type: 'record_evidence', kind: 'struggled', note: 'Stuck', source: 'observation' });
    h.tutor({
      type: 'record_evidence',
      kind: 'applied',
      note: 'Solved one',
      source: 'observation',
    });
    h.learner({ type: 'adjust_mastery', nodeId: 'limits', setTo: 0.95 });
    assertError(
      h.refuse({ by: 'tutor', type: 'complete_topic', how: 'mastered' }),
      'not_ready',
      /only 1 of the 2/,
    );

    // Work from before a reopen showed what the learner could do then.
    const again = teaching();
    master(again);
    again.tutor({ type: 'complete_topic', how: 'mastered' });
    again.learner({ type: 'reopen_topic', nodeId: 'limits' });
    again.learner({ type: 'adjust_mastery', nodeId: 'limits', setTo: 0.95 });
    assertError(
      again.refuse({ by: 'tutor', type: 'complete_topic', how: 'mastered' }),
      'not_ready',
      /only 0 of the 2/,
    );
    master(again);
    again.tutor({ type: 'complete_topic', how: 'mastered' });
    assert.equal(again.state.plan!.nodes[0].completedHow, 'mastered');
  });

  test('more_practice reopens a completed topic and caps it below READY', () => {
    const h = teaching();
    master(h);
    const before = h.state.mastery.limits.confidence;
    h.tutor({ type: 'complete_topic', how: 'mastered' });
    const events = h.learner({ type: 'more_practice', nodeId: 'limits' });
    assert.deepEqual(types(events), ['topic_reopened:learner', 'evidence_recorded:learner']);
    assert.ok(before > MORE_PRACTICE_CAP);
    assert.equal(h.state.mastery.limits.confidence, MORE_PRACTICE_CAP);
    assert.equal(h.state.phase, 'teaching');

    assertError(
      h.refuse({ by: 'learner', type: 'more_practice', nodeId: 'limits' }),
      'nothing_to_change',
    );
    const low = teaching();
    low.learner({ type: 'skip_topic', nodeId: 'limits' });
    assert.deepEqual(types(low.learner({ type: 'more_practice', nodeId: 'limits' })), [
      'topic_reopened:learner',
    ]);
    assertError(
      teaching({ learnerModelEditable: false }).refuse({
        by: 'learner',
        type: 'more_practice',
        nodeId: 'limits',
      }),
      'not_editable',
    );
  });

  test('adjust_mastery sets an absolute value', () => {
    const h = teaching();
    h.learner({ type: 'adjust_mastery', nodeId: 'derivatives', setTo: 0.55, note: 'Too low' });
    assert.equal(h.state.mastery.derivatives.confidence, 0.55);
    const last = h.state.mastery.derivatives.evidence.at(-1)!;
    assert.equal(last.type, 'self_report');
    assert.equal(last.details, 'Too low');
    assertError(
      h.refuse({ by: 'learner', type: 'adjust_mastery', nodeId: 'derivatives', setTo: 0.55 }),
      'nothing_to_change',
    );
    assertError(
      h.refuse({ by: 'learner', type: 'adjust_mastery', nodeId: 'derivatives', setTo: 1.5 }),
      'invalid_arguments',
    );
    assertError(
      h.refuse({ by: 'learner', type: 'adjust_mastery', nodeId: 'x', setTo: 0.5 }),
      'unknown_node',
    );
    assertError(
      teaching({ learnerModelEditable: false }).refuse({
        by: 'learner',
        type: 'adjust_mastery',
        nodeId: 'limits',
        setTo: 0.5,
      }),
      'not_editable',
    );
    assertError(
      harness().refuse({ by: 'learner', type: 'adjust_mastery', nodeId: 'limits', setTo: 0.5 }),
      'no_plan',
    );
  });

  test('flag_review toggles and refuses no-ops', () => {
    const h = teaching();
    h.learner({ type: 'flag_review', nodeId: 'limits', flagged: true });
    assert.equal(h.state.mastery.limits.needsReview, true);
    assertError(
      h.refuse({ by: 'learner', type: 'flag_review', nodeId: 'limits', flagged: true }),
      'nothing_to_change',
    );
    h.learner({ type: 'flag_review', nodeId: 'limits', flagged: false });
    assert.equal(h.state.mastery.limits.needsReview, false);
    assertError(
      teaching({ learnerModelEditable: false }).refuse({
        by: 'learner',
        type: 'flag_review',
        nodeId: 'limits',
        flagged: true,
      }),
      'not_editable',
    );
  });

  test('dismiss_card closes an open card and nothing else', () => {
    const h = harness();
    h.tutor({ type: 'ask_intake', questions: INTAKE });
    const intakeId = h.state.awaiting!.id;
    assertError(
      h.refuse({ by: 'learner', type: 'dismiss_card', card: 'intake', cardId: 'zzz' }),
      'unknown_card',
    );
    h.learner({ type: 'dismiss_card', card: 'intake', cardId: intakeId });
    assert.equal(h.state.awaiting, undefined);
    assertError(
      h.refuse({ by: 'learner', type: 'answer_intake', intakeId, responses: { q1: ['x'] } }),
      'card_closed',
    );
    h.tutor({ type: 'ask_intake', questions: INTAKE });
    const second = h.state.awaiting!.id;
    h.learner({ type: 'answer_intake', intakeId: second, responses: { q1: ['x'] } });
    assertError(
      h.refuse({ by: 'learner', type: 'dismiss_card', card: 'intake', cardId: second }),
      'already_answered',
    );
  });
});

test('decide is pure: same state, command and context give the same events', () => {
  const h = teaching();
  const ctx = {
    chatId: 'c',
    at: 42,
    idFactory: () => {
      let n = 0;
      return () => `e${++n}`;
    },
    flags: h.flags,
  };
  const cmd = { by: 'learner' as const, type: 'mark_known' as const, nodeId: 'limits' };
  const a = step(h.state, cmd, { ...ctx, idFactory: ctx.idFactory() });
  const b = step(h.state, cmd, { ...ctx, idFactory: ctx.idFactory() });
  assert.deepEqual(a, b);
  assert.ok(a.ok);
  assert.equal(a.events[0].seq, h.state.lastSeq + 1);
  assert.equal(a.events[1].seq, h.state.lastSeq + 2);
  assert.ok(a.events.every((e) => e.at === 42 && e.chatId === 'c'));
});
