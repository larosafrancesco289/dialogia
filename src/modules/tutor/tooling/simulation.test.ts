// The simulation harness end to end with scripted models: the tutor through the real
// pipeline (store, compose, agent loop, registry, engine), the student answering cards
// through learner commands, and the --check assertions.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createPipelineClient, type PipelineClient } from '@/lib/agent/pipelineClient';
import { buildTransportAuth } from '@/lib/auth/transport';
import { OPENROUTER_ENDPOINT } from '@/lib/transport/endpoints';
import type { ModelMessage, ToolCall } from '@/lib/transport/contracts';
import type { TransportStreamParams } from '@/lib/transport/types';
import type { Chat, ModelDescriptor } from '@/lib/types';
import { DEFAULT_TUTOR_FLAGS, type TutorEvent, type TutorEventOf } from '@/modules/tutor/engine';
import { checkRun } from '@/modules/tutor/tooling/check';
import { runTutorSimulationCli } from '@/modules/tutor/tooling/cli';
import type { Scenario } from '@/modules/tutor/tooling/scenarios';
import { HeadlessTutorSession } from '@/modules/tutor/tooling/session';
import { runSimulation, type SimulationRun } from '@/modules/tutor/tooling/simulation';
import { SimulatedStudent, type StudentLLM } from '@/modules/tutor/tooling/student';

const TUTOR = 'provider/tutor';

const model: ModelDescriptor = {
  id: TUTOR,
  name: 'Tutor',
  context_length: 32000,
  raw: { supported_parameters: ['tools'] },
};

const SCENARIO: Scenario = {
  id: 'test_equations',
  title: 'Equations',
  level: 'beginner',
  goal: 'Solve linear equations',
  constraints: ['Test on Friday'],
  persona: 'A careful student.',
  successCriteria: 'Solves equations.',
  known: [{ topic: 'one-step equations', keywords: ['one-step'] }],
  gaps: [
    {
      topic: 'word problems',
      keywords: ['word problem'],
      errorRate: 1,
      misconception: 'Reads "increased by" as multiplication.',
    },
  ],
  exchanges: 6,
};

const PLAN = {
  goal: 'Solve linear equations',
  topics: [
    { id: 'inverse-operations', name: 'Inverse operations', objectives: ['Undo an operation'] },
    {
      id: 'one-step-equations',
      name: 'One-step equations',
      objectives: ['Solve x + a = b'],
      prerequisites: ['inverse-operations'],
    },
    {
      id: 'word-problems',
      name: 'Word problems',
      objectives: ['Write the equation a word problem describes'],
      prerequisites: ['one-step-equations'],
    },
  ],
};

let callIds = 0;
const call = (name: string, args: Record<string, unknown>): ToolCall => ({
  id: `call-${++callIds}`,
  type: 'function',
  function: { name, arguments: JSON.stringify(args) },
});

function textOf(content: ModelMessage['content'] | undefined): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((b) => ('text' in b && typeof b.text === 'string' ? b.text : '')).join('');
}

/** Streams `text`, then ends the round with the given calls. */
function reply(params: TransportStreamParams, text: string, toolCalls: ToolCall[] = []) {
  const cb = params.callbacks;
  if (toolCalls.length) {
    cb?.onToolCallDelta?.(
      toolCalls.map((tc, index) => ({ index, id: tc.id, function: { name: tc.function.name } })),
    );
  }
  if (text) cb?.onToken?.(text);
  cb?.onDone?.(text, {
    finishReason: toolCalls.length ? 'tool_calls' : 'stop',
    toolCalls,
    usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.0001 },
  });
}

/** A tutor that follows the protocol, with one mistake it corrects in the next round. */
function scriptedTutor(params: TransportStreamParams): void {
  const messages = params.messages;
  const lastUser = messages.map((m) => m.role).lastIndexOf('user');
  const said = textOf(messages[lastUser]?.content);
  const round = messages.slice(lastUser + 1).filter((m) => m.role === 'assistant').length + 1;
  const system = textOf(messages.find((m) => m.role === 'system')?.content);

  if (said.startsWith('Answered the intake')) {
    return reply(params, 'Here is a plan.', [call('propose_plan', PLAN)]);
  }
  if (said === 'Approved the plan') {
    return reply(params, 'First, a quick check on inverse operations.', [
      call('give_quiz', {
        items: [
          { question: 'What undoes adding 3?', choices: ['Subtract 3', 'Add 3'], correct: 0 },
          { question: 'What undoes doubling?', choices: ['Doubling', 'Halving'], correct: 1 },
        ],
      }),
    ]);
  }
  if (said.startsWith('Answered the quiz')) {
    if (round === 1) {
      return reply(params, 'You undo each step in reverse.', [
        call('record_evidence', { kind: 'applied', note: 'Undid a step', weight: 0.7 }),
        call('complete_topic', { topicId: 'inverse-ops-typo' }),
      ]);
    }
    if (round === 2) return reply(params, '', [call('complete_topic', {})]);
    return reply(params, 'That closes inverse operations.');
  }
  if (said.startsWith('Going on: '))
    return reply(params, 'Word problems: read the sentence first.');
  if (system.includes('Phase: intake')) {
    return reply(params, 'A couple of questions first.', [
      call('ask_intake', {
        questions: [
          { question: 'When is the test?', options: [{ label: 'This week' }, { label: 'Later' }] },
          {
            question: 'What do you know already?',
            options: [{ label: 'Complete beginner' }, { label: 'Some algebra' }],
          },
        ],
      }),
    ]);
  }
  return reply(params, 'Show me your working.');
}

/** The student's model: JSON for the screen questions, a short line otherwise. */
const scriptedStudent =
  (edits: Array<Record<string, unknown>> = []): StudentLLM =>
  async (messages) => {
    const prompt = textOf(messages[messages.length - 1]?.content);
    if (prompt.includes('{"answers"')) {
      return '{"answers": {}}';
    }
    if (prompt.includes('"decision"')) return '{"decision": "approve"}';
    if (prompt.includes('"choice"')) return '{"choice": "go_on"}';
    if (prompt.includes('"edits"')) return JSON.stringify({ edits: edits.splice(0, 1) });
    return 'Is it x = 4?';
  };

function tutorPipeline(requests: TransportStreamParams[], script = scriptedTutor): PipelineClient {
  return createPipelineClient({
    streamChatCompletion: async (params) => {
      requests.push(params);
      script(params);
    },
  });
}

function chat(): Chat {
  return {
    id: `sim-test-${Math.random().toString(36).slice(2)}`,
    title: 'Simulated',
    createdAt: 1,
    updatedAt: 1,
    settings: {
      modelId: TUTOR,
      system: '',
      generation: {},
      ui: {
        showThinkingByDefault: false,
        showStats: false,
        showToolCallLog: true,
        showDebugRawJson: false,
      },
      features: {
        search: { enabled: false, provider: 'openrouter' },
        tutor: { enabled: true, defaultModelId: TUTOR },
      },
    },
  };
}

async function simulate(): Promise<{
  run: SimulationRun;
  requests: TransportStreamParams[];
  session: HeadlessTutorSession;
}> {
  const requests: TransportStreamParams[] = [];
  const session = new HeadlessTutorSession({
    chat: chat(),
    models: [model],
    resolveAuth: () => buildTransportAuth({ endpoint: OPENROUTER_ENDPOINT, apiKey: 'test' }),
    pipeline: tutorPipeline(requests),
  });
  const student = new SimulatedStudent({
    scenario: SCENARIO,
    // After the first chapter, the student quietly marks a topic it knows as known.
    llm: scriptedStudent([{ action: 'mark_known', topicId: 'one-step-equations' }]),
    baseErrorRate: 0,
  });
  const run = await runSimulation({
    session,
    student,
    exchanges: 6,
    flags: DEFAULT_TUTOR_FLAGS,
    learnerEdits: true,
    meta: { tutorModel: TUTOR, studentModel: 'provider/student', seed: 1 },
  });
  return { run, requests, session };
}

const lastUserText = (params: TransportStreamParams) => {
  const users = params.messages.filter((m) => m.role === 'user');
  return textOf(users[users.length - 1]?.content);
};

test('a simulated session answers every card through learner commands, as the UI does', async () => {
  const { run, requests, session } = await simulate();
  const x = run.exchanges;
  assert.equal(x.length, 6);

  // Card and chapter-break actions went out as visible ledger lines, as the UI sends them.
  const users = session.messages().filter((m) => m.role === 'user');
  assert.deepEqual(
    users.map((m) => m.ledger === true),
    x.map((e) => e.student.kind === 'ledger'),
  );
  assert.ok(users.every((m) => !m.metadata?.hiddenFromUser));

  // 1: the opening; the tutor asks intake questions and the card ends the turn.
  assert.equal(x[0].student.kind, 'typed');
  assert.deepEqual(
    x[0].tutor.toolCalls.map((c) => [c.name, c.ok]),
    [['ask_intake', true]],
  );
  assert.equal(x[0].after.awaiting?.kind, 'intake');

  // 2: the intake was answered by command, then the UI's line went to the tutor.
  assert.equal(x[1].student.kind, 'ledger');
  assert.equal(x[1].student.text, 'Answered the intake questions');
  assert.deepEqual(
    x[1].student.actions.map((a) => [a.action.type, a.ok]),
    [['answer_intake', true]],
  );
  assert.equal(x[1].after.phase, 'proposal');

  // 3: approved on the card; the engine started the first topic; a quiz follows.
  assert.equal(x[2].student.text, 'Approved the plan');
  assert.equal(x[2].student.actions[0].action.type, 'approve_plan');
  assert.equal(x[2].after.awaiting?.kind, 'quiz');

  // 4: both items answered one by one, graded by the engine; the tutor's bad topic id
  // came back as an error it fixed in the next round.
  assert.equal(x[3].student.text, 'Answered the quiz: 2 of 2 right');
  assert.deepEqual(
    x[3].student.actions.map((a) => a.action.type),
    ['answer_quiz_item', 'answer_quiz_item'],
  );
  assert.deepEqual(
    x[3].tutor.toolCalls.map((c) => [c.name, c.ok, c.code ?? null]),
    [
      ['record_evidence', true, null],
      ['complete_topic', false, 'unknown_node'],
      ['complete_topic', true, null],
    ],
  );
  assert.equal(x[3].tutor.requests.length, 3);
  assert.equal(x[3].after.phase, 'interlude');
  assert.equal(x[3].tutor.usage?.promptTokens, 300);

  // After it, a quiet edit: the student marks a topic it knows as known.
  assert.deepEqual(
    x[3].quietEdits.map((a) => [a.action.type, a.ok]),
    [['mark_known', true]],
  );

  // 5: at the chapter break the student pressed Go on; the tutor heard about the edit.
  assert.equal(x[4].student.text, 'Going on: Word problems');
  assert.deepEqual(x[4].student.actions[0].action, {
    type: 'start_topic',
    nodeId: 'word-problems',
  });
  assert.ok(x[4].tutor.requests[0].stateBlock?.includes("Since the learner's last message"));
  assert.equal(x[4].after.currentTopic, 'word-problems');

  // 6: an ordinary typed reply.
  assert.equal(x[5].student.kind, 'typed');
  assert.equal(x[5].student.text, 'Is it x = 4?');

  // The tutor model saw what the learner sent, and the state block, on every request.
  assert.equal(lastUserText(requests[requests.length - 1]), 'Is it x = 4?');
  assert.ok(x.every((e) => e.tutor.requests.every((r) => r.stateBlock?.includes('Phase: '))));

  // The run carries the whole log and its fold.
  const quizEvidence = run.events.filter(
    (e) => e.type === 'evidence_recorded' && e.source === 'quiz',
  );
  assert.equal(quizEvidence.length, 2);
  assert.equal(
    run.state.plan?.nodes.find((n) => n.id === 'one-step-equations')?.completedHow,
    'known',
  );
  assert.equal(run.meta.exchanges, 6);

  const checks = checkRun(run);
  assert.deepEqual(
    checks.filter((c) => !c.ok).map((c) => [c.id, c.problems]),
    [],
  );
});

test('the checks fail a session that breaks the protocol', async () => {
  const { run } = await simulate();
  const broken: SimulationRun = structuredClone(run);
  const x = broken.exchanges;

  // A request without the state block.
  delete x[1].tutor.requests[0].stateBlock;
  // A call the tutor never fixed.
  x[5].tutor.toolCalls.push({ name: 'give_quiz', ok: false, args: {}, code: 'invalid_arguments' });
  // One quiz answer scored twice.
  const evidence = broken.events.find(
    (e) => e.type === 'evidence_recorded' && e.source === 'quiz',
  ) as TutorEvent;
  broken.events.push({ ...evidence, id: 'dup', seq: broken.state.lastSeq + 1 });
  // A reply that gained on a topic it also noted a misconception on (an old engine allowed it).
  const observed = broken.events.find(
    (e) => e.type === 'evidence_recorded' && e.source === 'observation',
  ) as TutorEventOf<'evidence_recorded'>;
  broken.events.push({
    id: 'misconception',
    chatId: observed.chatId,
    seq: broken.state.lastSeq + 2,
    at: observed.at,
    by: 'tutor',
    messageId: observed.messageId,
    type: 'misconception_noted',
    nodeId: observed.nodeId,
    misconceptionId: 'm',
    description: 'm',
  });
  // A card the learner never got to answer.
  x[2].student.actions = [];
  // A replayed quiz that still carries its key.
  x[4].tutor.requests[0].answerKeyLeaks = 1;
  // Imported mastery outside [0, 1]: the import clamps it, so the range holds.
  broken.events.unshift({
    id: 'legacy',
    chatId: 'c',
    seq: 0,
    at: 0,
    by: 'system',
    type: 'legacy_imported',
    plan: {
      goal: 'g',
      generatedAt: 0,
      updatedAt: 0,
      version: 1,
      nodes: [{ id: 'n', name: 'N', objectives: ['o'], prerequisites: [], status: 'not_started' }],
    },
    learnerModel: {
      mastery: {
        n: {
          nodeId: 'n',
          confidence: 1.4,
          interactions: 0,
          lastInteraction: 0,
          evidence: [],
          misconceptions: [],
          needsReview: false,
        },
      },
    } as never,
  });

  const failed = checkRun(broken, { planWithin: 1, topicWithin: 2 })
    .filter((c) => !c.ok)
    .map((c) => c.id);
  assert.deepEqual(failed.sort(), [
    'cards_answerable',
    'evidence_once_per_answer',
    'no_answer_keys_replayed',
    'no_gain_with_misconception',
    'plan_approved_within',
    'state_block_every_request',
    'tool_errors_recovered',
    'topic_completed_within',
  ]);
});

test('a misconception an earlier answer showed does not count against the reply’s gain', async () => {
  const { run } = await simulate();
  const observed = run.events.find(
    (e) => e.type === 'evidence_recorded' && e.source === 'observation',
  ) as TutorEventOf<'evidence_recorded'>;
  const noted = (id: string, seq: number, shownBy?: 'earlier_answer'): TutorEvent => ({
    id,
    chatId: observed.chatId,
    seq,
    at: observed.at,
    by: 'tutor',
    messageId: observed.messageId,
    type: 'misconception_noted',
    nodeId: observed.nodeId,
    misconceptionId: 'm',
    description: 'm',
    ...(shownBy ? { shownBy } : {}),
  });
  const verdict = (event: TutorEvent) =>
    checkRun({ ...run, events: [...run.events, event] }).find(
      (c) => c.id === 'no_gain_with_misconception',
    )?.ok;
  assert.equal(verdict(noted('earlier', run.state.lastSeq + 1, 'earlier_answer')), true);
  assert.equal(verdict(noted('latest', run.state.lastSeq + 1)), false);
});

test('the CLI writes the transcript and report, and --check sets the exit code', async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'tutor-sim-'));
  const lines: string[] = [];
  const studentLLM = scriptedStudent();
  const pipeline = (script: typeof scriptedTutor): PipelineClient =>
    createPipelineClient({
      streamChatCompletion: async (params) => script(params),
      chatCompletion: async (params) => ({
        id: 'student',
        object: 'chat.completion',
        created: 0,
        model: params.model,
        choices: [
          { index: 0, message: { role: 'assistant', content: await studentLLM(params.messages) } },
        ],
      }),
    });

  const healthy = await runTutorSimulationCli(
    ['--scenario', 'linear_equations', '--turns', '5', '--out', out, '--check', '--quiet'],
    { pipeline: pipeline(scriptedTutor), log: (line) => lines.push(line) },
  );
  assert.equal(healthy, 0, lines.join('\n'));
  const files = await fs.readdir(out);
  const json = files.find((f) => f.endsWith('.json'));
  assert.ok(json && files.some((f) => f.endsWith('.txt')));
  const written = JSON.parse(await fs.readFile(path.join(out, json!), 'utf8'));
  assert.equal(written.exchanges.length, 5);
  assert.ok(Array.isArray(written.events) && written.state.plan);
  assert.ok(written.checks.every((c: { ok: boolean }) => c.ok));
  assert.ok(lines.join('\n').includes('Checks: 11 of 11 passed'));

  // A tutor that only chats never gets a plan approved.
  const chatty = await runTutorSimulationCli(
    ['--turns', '3', '--plan-within', '1', '--out', out, '--check', '--quiet'],
    { pipeline: pipeline((params) => reply(params, 'Tell me more.')), log: () => undefined },
  );
  assert.equal(chatty, 1);
  await fs.rm(out, { recursive: true, force: true });
});
