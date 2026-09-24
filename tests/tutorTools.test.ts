import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from 'zustand/vanilla';
import type { StateCreator } from 'zustand';
import { loadModuleRuntimes } from '@/lib/modules';
import { buildStoreInitializer } from '@/lib/store/createStore';
import type { StoreState } from '@/lib/store/types';
import { getToolHandler } from '@/lib/tools/registry';
import type { ToolExecutionContext } from '@/lib/tools/execution';
import type { Chat, Message } from '@/lib/types';
import { CALCULUS, QUIZ_ITEMS } from '@/modules/tutor/engine/testSupport';

before(async () => {
  await loadModuleRuntimes();
});

let counter = 0;

function setup() {
  const chatId = `chat-tools-${(counter += 1)}`;
  const chat = {
    id: chatId,
    title: 'Tools',
    createdAt: 1,
    updatedAt: 1,
    settings: {
      modelId: 'provider/model',
      generation: {},
      ui: {
        showThinkingByDefault: false,
        showStats: false,
        showToolCallLog: false,
        showDebugRawJson: false,
      },
      features: { search: { enabled: false, provider: 'openrouter' }, tutor: { enabled: true } },
    },
  } satisfies Chat;
  const store = createStore<StoreState>(
    buildStoreInitializer() as unknown as StateCreator<StoreState>,
  );
  store.setState({ chats: [chat] });
  const logged: Array<{ name: string; ok: boolean }> = [];

  const call = async (name: string, args: unknown, messageId = 'reply-1') => {
    const handler = getToolHandler(name);
    assert.ok(handler, `${name} is registered`);
    const assistantMessage: Message = {
      id: messageId,
      chatId,
      role: 'assistant',
      content: '',
      createdAt: 1,
    };
    const context = {
      chat,
      chatId,
      assistantMessage,
      userContent: '',
      searchProvider: 'openrouter',
      controller: new AbortController(),
      set: store.setState,
      get: store.getState,
      persistMessage: async () => {},
      logger: {
        start: ({ name: logged_name }: { name: string }) => ({
          success: () => logged.push({ name: logged_name, ok: true }),
          error: () => logged.push({ name: logged_name, ok: false }),
        }),
      },
    } as unknown as ToolExecutionContext;
    return handler({
      toolCall: {
        id: `${name}-call`,
        type: 'function',
        function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) },
      },
      parsedArgs: {},
      context,
      aggregatedResults: [],
    });
  };

  const session = () => store.getState().tutorSessions[chatId];
  return { chatId, store, call, session, logged };
}

const planArgs = {
  goal: CALCULUS.goal,
  topics: CALCULUS.nodes.map((node) => ({ ...node, prerequisites: node.prerequisites })),
};

async function teaching() {
  const t = setup();
  const proposed = await t.call('propose_plan', planArgs, 'reply-plan');
  assert.equal(proposed.usedTool, true);
  const proposalId = t.session().state.proposal!.proposalId;
  await t.store
    .getState()
    .dispatchTutor(
      t.chatId,
      { by: 'learner', type: 'approve_plan', proposalId },
      { by: 'learner', messageId: 'reply-plan' },
    );
  return t;
}

test('a card applies through the engine, ends the turn, and belongs to the reply', async () => {
  const t = setup();
  const outcome = await t.call('ask_intake', {
    questions: [
      { question: 'What is your goal?', options: [{ label: 'Exam' }, { label: 'Curiosity' }] },
      {
        question: 'What do you know already?',
        options: [{ label: 'Complete beginner' }, { label: 'Some' }],
      },
    ],
  });

  assert.equal(outcome.usedTool, true);
  assert.equal(outcome.usedContentTool, true);
  assert.equal(outcome.endsTurn, true);
  assert.deepEqual(outcome.result, {
    ok: true,
    shown: 'intake',
    note: 'The learner sees your questions. Wait for their answers.',
  });
  const [event] = t.session().events;
  assert.equal(event.type, 'intake_asked');
  assert.equal(event.by, 'tutor');
  assert.equal(event.messageId, 'reply-1');
  assert.deepEqual(t.session().state.awaiting?.kind, 'intake');
  assert.deepEqual(t.logged, [{ name: 'ask_intake', ok: true }]);
});

test('bad arguments come back as a structured error, never a throw or a silent success', async () => {
  const t = setup();
  const json = await t.call('ask_intake', '{not json');
  assert.equal(json.usedTool, false);
  assert.equal(json.endsTurn, undefined);
  assert.equal(json.result?.ok, false);
  assert.equal(json.result?.error, 'invalid_arguments');
  assert.ok(typeof json.result?.hint === 'string' && json.result.hint.length > 0);

  const shape = await t.call('give_quiz', { items: [] });
  assert.equal(shape.result?.error, 'invalid_arguments');
  assert.equal(t.session()?.events.length ?? 0, 0);
  assert.deepEqual(
    t.logged.map((l) => l.ok),
    [false, false],
  );
});

test('the engine’s gate refuses with a hint: no quiz before a plan, no unknown topic', async () => {
  const t = setup();
  const early = await t.call('give_quiz', { items: QUIZ_ITEMS });
  assert.equal(early.usedTool, false);
  assert.equal(early.result?.error, 'wrong_phase');

  const tt = await teaching();
  const unknown = await tt.call('record_evidence', {
    kind: 'applied',
    note: 'Did it',
    topicId: 'integrals',
  });
  assert.equal(unknown.result?.error, 'unknown_node');
  assert.match(String(unknown.result?.hint), /limits/);
});

test('a state tool returns the new estimate and does not end the turn', async () => {
  const t = await teaching();
  const outcome = await t.call('record_evidence', { kind: 'applied', note: 'Solved one' });
  assert.equal(outcome.usedTool, true);
  assert.equal(outcome.usedContentTool, false);
  assert.equal(outcome.endsTurn, false);
  assert.deepEqual(outcome.result, {
    ok: true,
    id: 'limits',
    mastery: 51,
    band: 'practising',
    was: 30,
  });
});

test('a quiz replays without its answer keys', async () => {
  const t = await teaching();
  const outcome = await t.call('give_quiz', {
    items: [
      { question: 'lim x->0 of x?', choices: ['0', '1'], correct: 0, explanation: 'It is 0' },
    ],
  });
  assert.equal(outcome.endsTurn, true);
  assert.deepEqual(outcome.replay?.arguments, {
    items: [{ question: 'lim x->0 of x?', choices: ['0', '1'] }],
  });
  assert.ok(!JSON.stringify(outcome.result).includes('correct'));
  // The key stays in the log, where the engine grades with it.
  const quiz = Object.values(t.session().state.quizzes)[0];
  assert.equal(quiz.items[0].correct, 0);
});

test('two state tools in one round both land, in order', async () => {
  const t = await teaching();
  // Enough evidence to complete as mastered: the second call must see the first.
  await t.call('record_evidence', { kind: 'applied', note: 'Applied it', weight: 0.7 });
  const [evidence, complete] = await Promise.all([
    t.call('record_evidence', { kind: 'insight', note: 'Saw why', weight: 0.5 }),
    t.call('complete_topic', {}),
  ]);
  assert.equal(evidence.result?.ok, true);
  assert.equal(complete.result?.ok, true);
  assert.equal(complete.result?.phase, 'interlude');
  const kinds = t.session().events.map((e) => e.type);
  assert.deepEqual(kinds.slice(-3), ['evidence_recorded', 'evidence_recorded', 'topic_completed']);
});
