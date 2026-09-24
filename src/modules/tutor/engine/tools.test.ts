import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyTutorState,
  TOOL_ENDS_TURN,
  TUTOR_TOOLS,
  TUTOR_TOOL_NAMES,
  availableTutorTools,
  decide,
  parseTutorToolCall,
  step,
  tutorToolDefinitions,
  tutorToolError,
  tutorToolResult,
  withAdjustments,
  type TutorToolCommand,
  type TutorToolName,
} from '@/modules/tutor/engine';
import {
  CALCULUS,
  QUIZ_ITEMS,
  harness,
  master,
  teaching,
  type Harness,
} from '@/modules/tutor/engine/testSupport';

const available = (h: Harness) => availableTutorTools(h.state, h.flags);

test('availability follows phase, open card, flags and budget', () => {
  const h = harness();
  assert.deepEqual(available(h), ['ask_intake', 'give_diagnostic', 'propose_plan']);

  h.tutor({
    type: 'ask_intake',
    questions: [
      { question: 'a', options: [{ label: 'x' }, { label: 'y' }] },
      { question: 'b', options: [{ label: 'x' }, { label: 'y' }] },
    ],
  });
  assert.deepEqual(available(h), [], 'an open card blocks every other card');

  const p = harness();
  p.tutor({ type: 'propose_plan', ...CALCULUS });
  assert.deepEqual(available(p), ['give_diagnostic', 'propose_plan']);

  const t = teaching();
  assert.deepEqual(available(t), [
    'propose_plan',
    'give_quiz',
    'record_evidence',
    'note_misconception',
    'resolve_misconception',
    'complete_topic',
    'start_topic',
  ]);
  assert.deepEqual(available(teaching({ planEditable: false })), [
    'give_quiz',
    'record_evidence',
    'note_misconception',
    'resolve_misconception',
    'complete_topic',
  ]);

  t.tutor({ type: 'give_quiz', items: QUIZ_ITEMS });
  assert.ok(!available(t).includes('give_quiz'));
  assert.ok(!available(t).includes('propose_plan'));
  assert.ok(available(t).includes('record_evidence'), 'talking about the quiz is still fine');

  const spent = teaching();
  for (let i = 0; i < 3; i += 1) {
    spent.tutor({ type: 'give_quiz', items: QUIZ_ITEMS.slice(0, 1) });
    spent.learner({
      type: 'answer_quiz_item',
      quizId: spent.state.awaiting!.id,
      itemId: 'q1',
      choice: 1,
    });
  }
  assert.ok(!available(spent).includes('give_quiz'));

  const i = teaching();
  master(i);
  i.tutor({ type: 'complete_topic', how: 'mastered' });
  assert.deepEqual(available(i), [
    'give_diagnostic',
    'propose_plan',
    'record_evidence',
    'start_topic',
  ]);

  i.learner({ type: 'mark_known', nodeId: 'derivatives' });
  i.learner({ type: 'mark_known', nodeId: 'chain-rule' });
  assert.equal(i.state.phase, 'complete');
  assert.deepEqual(available(i), ['propose_plan']);
});

const SAMPLES: Record<TutorToolName, TutorToolCommand> = {
  ask_intake: {
    by: 'tutor',
    type: 'ask_intake',
    questions: [
      { question: 'a', options: [{ label: 'x' }, { label: 'y' }] },
      { question: 'b', options: [{ label: 'x' }, { label: 'y' }] },
    ],
  },
  give_diagnostic: { by: 'tutor', type: 'give_diagnostic', topic: 't', items: QUIZ_ITEMS },
  propose_plan: { by: 'tutor', type: 'propose_plan', ...CALCULUS },
  give_quiz: { by: 'tutor', type: 'give_quiz', items: QUIZ_ITEMS },
  record_evidence: {
    by: 'tutor',
    type: 'record_evidence',
    nodeId: 'limits',
    kind: 'applied',
    note: 'n',
    source: 'observation',
  },
  note_misconception: {
    by: 'tutor',
    type: 'note_misconception',
    nodeId: 'limits',
    description: 'd',
  },
  resolve_misconception: { by: 'tutor', type: 'resolve_misconception', misconceptionId: 'm' },
  complete_topic: { by: 'tutor', type: 'complete_topic', how: 'mastered' },
  start_topic: { by: 'tutor', type: 'start_topic', nodeId: 'derivatives' },
};

const GATE_CODES = new Set(['wrong_phase', 'card_open', 'budget_exhausted', 'not_editable']);

test('an offered tool is never refused by its gate, and a withheld one always is', () => {
  const states: Harness[] = [
    harness(),
    harness(),
    harness(),
    teaching(),
    teaching({ planEditable: false }),
  ];
  states[1].tutor(SAMPLES.ask_intake as never);
  states[2].tutor({ type: 'propose_plan', ...CALCULUS });
  const quizOpen = teaching();
  quizOpen.tutor({ type: 'give_quiz', items: QUIZ_ITEMS });
  const interlude = teaching();
  interlude.tutor({ type: 'complete_topic', how: 'skipped' });
  const complete = teaching();
  for (const nodeId of ['limits', 'derivatives', 'chain-rule']) {
    complete.learner({ type: 'skip_topic', nodeId });
  }
  states.push(quizOpen, interlude, complete);

  for (const h of states) {
    const offered = availableTutorTools(h.state, h.flags);
    for (const name of TUTOR_TOOL_NAMES) {
      const result = decide(h.state, SAMPLES[name], h.ctx());
      const label = `${name} in ${h.state.phase}`;
      if (offered.includes(name)) {
        assert.ok(result.ok || !GATE_CODES.has(result.error.code), label);
      } else {
        assert.ok(!result.ok && GATE_CODES.has(result.error.code), label);
      }
    }
    assert.deepEqual(
      tutorToolDefinitions(h.state, h.flags).map((d) => d.function.name),
      offered,
    );
  }
});

test('definitions are JSON-schema function tools with usage rules', () => {
  for (const name of TUTOR_TOOL_NAMES) {
    const def = TUTOR_TOOLS[name];
    assert.equal(def.type, 'function');
    assert.equal(def.function.name, name);
    const description = def.function.description ?? '';
    assert.ok(
      description.length > 60 && description.length < 700,
      `${name}: ${description.length}`,
    );
    assert.match(description, TOOL_ENDS_TURN[name] ? /Ends your turn/ : /Does not end your turn/);
    const params = def.function.parameters as Record<string, unknown>;
    assert.equal(params.type, 'object');
    assert.equal(params.additionalProperties, false);
    assert.ok(!('$schema' in params));
  }
  const quiz = TUTOR_TOOLS.give_quiz.function.parameters as {
    properties: { items: { maxItems: number; items: { required: string[] } } };
    required: string[];
  };
  assert.equal(quiz.properties.items.maxItems, 5);
  assert.deepEqual(quiz.properties.items.items.required, ['question', 'choices', 'correct']);
  const complete = TUTOR_TOOLS.complete_topic.function.parameters as { required?: string[] };
  assert.equal(complete.required, undefined, 'how defaults to mastered');
});

test('parsing turns arguments into commands, with defaults and topicId mapped to nodeId', () => {
  assert.deepEqual(
    parseTutorToolCall('record_evidence', '{"kind":"applied","note":"did it","topicId":"limits"}'),
    {
      ok: true,
      command: {
        by: 'tutor',
        type: 'record_evidence',
        nodeId: 'limits',
        kind: 'applied',
        note: 'did it',
        source: 'observation',
      },
    },
  );
  assert.deepEqual(parseTutorToolCall('complete_topic', undefined), {
    ok: true,
    command: { by: 'tutor', type: 'complete_topic', how: 'mastered', nodeId: undefined },
  });
  const plan = parseTutorToolCall('propose_plan', {
    goal: 'g',
    topics: [{ name: 'A', objectives: ['x'] }],
  });
  assert.ok(plan.ok && plan.command.type === 'propose_plan');
  assert.deepEqual(plan.command.nodes, [{ name: 'A', objectives: ['x'] }]);
  const start = parseTutorToolCall('start_topic', { topicId: 'derivatives' });
  assert.ok(
    start.ok && start.command.type === 'start_topic' && start.command.nodeId === 'derivatives',
  );
});

test('parsing errors are structured', () => {
  const unknown = parseTutorToolCall('record_learning', {});
  assert.ok(!unknown.ok);
  assert.equal(unknown.error.code, 'unknown_tool');
  assert.match(unknown.error.hint, /give_quiz/);

  const json = parseTutorToolCall('give_quiz', '{not json');
  assert.ok(!json.ok && json.error.code === 'invalid_arguments');

  const shape = parseTutorToolCall('give_quiz', {
    items: [{ question: 'q', choices: ['a'], correct: 0 }],
  });
  assert.ok(!shape.ok);
  assert.equal(shape.error.code, 'invalid_arguments');
  assert.match(shape.error.message, /items\.0\.choices/);
  assert.match(shape.error.hint, /give_quiz/);

  const kind = parseTutorToolCall('record_evidence', { kind: 'correct_answer', note: 'n' });
  assert.ok(!kind.ok && /kind/.test(kind.error.message));
});

test('parsed tool calls run through step end to end', () => {
  const h = harness();
  let state = h.state;
  const call = (name: TutorToolName, args: unknown) => {
    const parsed = parseTutorToolCall(name, args);
    assert.ok(parsed.ok, JSON.stringify(parsed));
    const result = step(state, parsed.command, h.ctx());
    assert.ok(result.ok, JSON.stringify(result));
    state = result.state;
  };
  call('propose_plan', {
    goal: 'Calculus',
    topics: [
      { id: 'limits', name: 'Limits', objectives: ['x'] },
      { name: 'Derivatives', objectives: ['y'], prerequisites: ['Limits'] },
    ],
  });
  assert.deepEqual(state.proposal?.plan.nodes[1].prerequisites, ['limits']);
  assert.deepEqual(
    tutorToolDefinitions(state, h.flags).map((d) => d.function.name),
    ['give_diagnostic', 'propose_plan'],
  );
});

test('results carry what the model needs and never an answer key', () => {
  const h = teaching();
  const run = (name: TutorToolName, args: unknown) => {
    const parsed = parseTutorToolCall(name, args);
    assert.ok(parsed.ok);
    const before = h.state;
    const events = h.tutor(parsed.command);
    return tutorToolResult(name, before, h.state, events);
  };

  const quiz = run('give_quiz', { items: QUIZ_ITEMS });
  assert.deepEqual(quiz, {
    ok: true,
    shown: 'quiz',
    topic: 'limits',
    quizzesLeft: 2,
    note: 'The learner sees the quiz. The engine grades each answer.',
  });
  assert.doesNotMatch(JSON.stringify(quiz), /correct|lim x/);
  const quizId = h.state.awaiting!.id;
  QUIZ_ITEMS.forEach((item, i) =>
    h.learner({ type: 'answer_quiz_item', quizId, itemId: `q${i + 1}`, choice: item.correct }),
  );

  const evidence = run('record_evidence', { kind: 'applied', note: 'Solved a new one' });
  assert.equal(evidence.id, 'limits');
  assert.equal(evidence.was, 85);
  assert.equal(evidence.mastery, 89);
  assert.equal(evidence.band, 'ready');

  const done = run('complete_topic', {});
  assert.equal(done.phase, 'interlude');
  assert.equal(done.nextInPlan, 'derivatives');
  assert.match(String(done.note), /chapter break/);

  const started = run('start_topic', { topicId: 'derivatives' });
  assert.deepEqual(started.topic, {
    id: 'derivatives',
    mastery: 30,
    band: 'building',
    name: 'Derivatives',
    objectives: ['Define the derivative', 'Apply the power rule'],
  });

  const plan = run('propose_plan', {
    goal: 'More',
    topics: [
      { id: 'limits', name: 'Limits', objectives: ['x'] },
      { name: 'Series', objectives: ['y'] },
    ],
  });
  assert.equal(plan.revision, true);
  assert.deepEqual(plan.topics, ['limits', 'series']);
  assert.deepEqual(plan.keepsProgressFor, ['limits']);

  assert.deepEqual(
    tutorToolError({ code: 'unknown_node', message: 'No topic "x".', hint: 'Valid topic ids: a.' }),
    { ok: false, error: 'unknown_node', message: 'No topic "x".', hint: 'Valid topic ids: a.' },
  );
});

test('parsing is lenient about placeholders and fields that do not apply', () => {
  // What GPT-6 Luna sent: every optional field filled, and record_evidence's retired setTo.
  const luna = parseTutorToolCall('record_evidence', {
    kind: 'applied',
    note: 'Solved 3x + 5 = 20 alone',
    source: 'observation',
    setTo: 0,
    weight: 0,
    topicId: '',
    confidence: 'high',
  });
  assert.ok(luna.ok, JSON.stringify(luna));
  assert.deepEqual(luna.command, {
    by: 'tutor',
    type: 'record_evidence',
    nodeId: undefined,
    kind: 'applied',
    note: 'Solved 3x + 5 = 20 alone',
    source: 'observation',
  });
  assert.ok(
    !luna.adjusted?.some((line) => /setTo/.test(line)),
    'a retired field is dropped quietly',
  );
  assert.ok(luna.adjusted?.some((line) => /confidence/.test(line)));
  const h = teaching();
  const events = h.tutor(luna.command);
  assert.equal(events.length, 1, 'the observation is recorded');

  const nulls = parseTutorToolCall('record_evidence', {
    kind: 'partial',
    note: 'n',
    topic_id: 'limits',
    weight: null,
    setTo: null,
    source: null,
  });
  assert.ok(nulls.ok && nulls.command.type === 'record_evidence');
  assert.equal(nulls.command.nodeId, 'limits', 'snake_case keys map to the schema');
  assert.equal(nulls.command.source, 'observation');
  assert.equal(nulls.adjusted, undefined, 'placeholders are dropped silently');

  const said = parseTutorToolCall('record_evidence', {
    kind: 'struggled',
    note: 'Says they never understood it',
    source: 'learner_said',
    set_to: '20',
  });
  assert.ok(said.ok && said.command.type === 'record_evidence');
  assert.equal('setTo' in said.command, false, 'setTo places nothing any more');
  assert.equal(said.command.source, 'learner_said');
  assert.equal(said.adjusted, undefined);

  const clamped = parseTutorToolCall('record_evidence', {
    kind: 'insight',
    note: 'n',
    weight: 0.9,
  });
  assert.ok(clamped.ok && clamped.command.type === 'record_evidence');
  assert.equal(clamped.command.weight, 0.7);

  const quiz = parseTutorToolCall('give_quiz', {
    title: null,
    items: [
      { question: 'q1', choices: ['a', 'b'], correct: 'B', explanation: '' },
      { question: 'q2', choices: ['x', 'y', 'z'], correct: 'z' },
      { question: 'q3', choices: ['1', '2'], correct: '0' },
    ],
  });
  assert.ok(quiz.ok && quiz.command.type === 'give_quiz', JSON.stringify(quiz));
  assert.deepEqual(
    quiz.command.items.map((item) => item.correct),
    [1, 2, 0],
  );
  assert.equal(quiz.command.title, undefined);

  const resolve = parseTutorToolCall('resolve_misconception', {
    misconceptionId: 'm',
    topicId: 'none',
    note: 'N/A',
  });
  assert.ok(resolve.ok && resolve.command.type === 'resolve_misconception');
  assert.equal(resolve.command.nodeId, undefined);
  assert.equal(resolve.command.note, undefined);
});

test('plan topics take a starting estimate, read leniently and capped below READY', () => {
  const parsed = parseTutorToolCall('propose_plan', {
    goal: 'g',
    topics: [
      {
        name: 'A',
        objectives: ['x'],
        startingEstimate: { value: 0, reason: '' },
        prerequisites: [''],
      },
      { name: 'B', objectives: ['y'], startingEstimate: { value: 90, reason: 'Uses it daily' } },
      { name: 'C', objectives: ['z'], startingEstimate: { value: 0.5 } },
    ],
  });
  assert.ok(parsed.ok && parsed.command.type === 'propose_plan', JSON.stringify(parsed));
  const [a, b, c] = parsed.command.nodes;
  assert.equal(a.startingEstimate, undefined);
  assert.deepEqual(a.prerequisites, []);
  assert.deepEqual(b.startingEstimate, { value: 0.75, reason: 'Uses it daily' });
  assert.ok(parsed.adjusted?.some((line) => /capped at 75%/.test(line)));
  assert.deepEqual(c.startingEstimate, { value: 0.5 });

  // On the learner's word alone, no higher than practising; after a diagnostic, up to 75%.
  const said = harness();
  const events = said.tutor(parsed.command);
  const result = tutorToolResult('propose_plan', emptyTutorState(), said.state, events);
  assert.deepEqual(result.startingEstimates, { b: 50, c: 50 });
  assert.match(String(result.startingEstimatesNote), /no higher than 50%/);
  const tested = harness();
  tested.tutor({
    type: 'give_diagnostic',
    topic: 't',
    items: [0, 1, 2].map((i) => ({ question: `q${i}`, choices: ['a', 'b'], correct: 0 })),
  });
  tested.learner({
    type: 'answer_diagnostic',
    diagnosticId: tested.state.awaiting!.id,
    answers: { q1: 0, q2: 0, q3: 1 },
  });
  const before = tested.state;
  const afterDiagnostic = tested.tutor(parsed.command);
  const diagnosed = tutorToolResult('propose_plan', before, tested.state, afterDiagnostic);
  assert.deepEqual(diagnosed.startingEstimates, { b: 75, c: 50 });
  assert.equal(diagnosed.startingEstimatesNote, undefined);
  assert.match(TUTOR_TOOLS.propose_plan.function.description ?? '', /startingEstimate/);
});

test('a refusal names the fields to change', () => {
  const bad = parseTutorToolCall('complete_topic', { how: 'known' });
  assert.ok(!bad.ok);
  assert.match(bad.error.message, /how: .*'mastered' \| 'skipped'/);
  assert.match(bad.error.hint, /^Change how /);
});

test('an accepted no-op says nothing changed', () => {
  const h = teaching();
  const before = h.state;
  const events = h.tutor({ type: 'start_topic', nodeId: 'limits' });
  assert.deepEqual(events, []);
  const result = tutorToolResult('start_topic', before, h.state, events);
  assert.equal(result.ok, true);
  assert.match(String(result.note), /already in progress/);
  assert.deepEqual(withAdjustments({ ok: true }, []), { ok: true });
  assert.deepEqual(withAdjustments({ ok: true }, ['x']), { ok: true, adjusted: ['x'] });
});
