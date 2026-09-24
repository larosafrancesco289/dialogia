import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from 'zustand/vanilla';
import type { StateCreator } from 'zustand';
import { repository } from '@/lib/db';
import { buildStoreInitializer } from '@/lib/store/createStore';
import type { StoreState } from '@/lib/store/types';
import type { Chat, LearnerModel, LearningPlan, Message, TopicMastery } from '@/lib/types';
import {
  canRedoReply,
  messageHasModuleContent,
  notifyChatDeleted,
  notifyReplyRetracted,
} from '@/lib/modules';
import { createAssistantMessage, createUserMessage } from '@/lib/messages/createMessage';
import { appendMessagesToChat, getMessagesForChat } from '@/lib/messages/indexing';
import { remainingBudgets } from '@/modules/tutor/engine';
import { CALCULUS, QUIZ_ITEMS } from '@/modules/tutor/engine/testSupport';
import { cardsForMessage } from '@/modules/tutor/ui/messageViews';

const newStore = () =>
  createStore<StoreState>(buildStoreInitializer() as unknown as StateCreator<StoreState>);

let chatCounter = 0;
const chatId = (label: string) => `chat-${label}-${(chatCounter += 1)}`;

function makeChat(id: string, tutor: NonNullable<Chat['settings']['features']['tutor']> = {}) {
  return {
    id,
    title: 'Calculus',
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
      features: {
        search: { enabled: false, provider: 'openrouter' },
        tutor: { enabled: true, ...tutor },
      },
    },
  } satisfies Chat;
}

// ---------------------------------------------------------------- legacy fixtures

const legacyPlan = (): LearningPlan => ({
  goal: 'Differentiate composite functions',
  generatedAt: 100,
  updatedAt: 200,
  version: 1,
  nodes: [
    {
      id: 'limits',
      name: 'Limits',
      objectives: ['Evaluate simple limits'],
      prerequisites: [],
      status: 'completed',
      startedAt: 100,
      completedAt: 150,
    },
    {
      id: 'derivatives',
      name: 'Derivatives',
      objectives: ['Apply the power rule'],
      prerequisites: ['limits'],
      status: 'in_progress',
      startedAt: 160,
    },
    {
      id: 'chain-rule',
      name: 'Chain rule',
      objectives: ['Differentiate composite functions'],
      prerequisites: ['derivatives'],
      status: 'not_started',
    },
  ],
});

const mastery = (nodeId: string, confidence: number): TopicMastery => ({
  nodeId,
  confidence,
  interactions: 2,
  lastInteraction: 150,
  evidence: [
    { timestamp: 120, type: 'correct_answer', details: 'Solved a limit', weight: 0.4 },
    { timestamp: 140, type: 'insight_demonstrated', details: 'Explained continuity', weight: 0.3 },
  ],
  misconceptions: [],
});

const model = (updatedAt: number, derivatives: number): LearnerModel => ({
  chatId: 'legacy',
  updatedAt,
  version: 1,
  mastery: { limits: mastery('limits', 0.85), derivatives: mastery('derivatives', derivatives) },
});

const assistant = (id: string, createdAt: number, extra: Partial<Message>): Message => ({
  id,
  chatId: '',
  role: 'assistant',
  content: `reply ${id}`,
  createdAt,
  ...extra,
});

/** A pre-rebuild tutor chat: every kind of card, a stale chat-level model, one card still open. */
function legacyChat(id: string) {
  const chat = makeChat(id, { learningPlan: legacyPlan(), learnerModel: model(1_000, 0.45) });
  const messages: Message[] = [
    assistant('a1', 1, {
      tutor: {
        questionnaire: {
          status: 'submitted',
          submittedAt: 2,
          questions: [
            {
              id: 'goal',
              question: 'What is your goal?',
              options: [{ label: 'Pass the exam' }, { label: 'Curiosity' }],
            },
            {
              id: 'level',
              question: 'How much calculus do you know?',
              options: [{ label: 'Complete beginner' }, { label: 'Some' }],
            },
          ],
          responses: { goal: ['Pass the exam'], level: ['Some'] },
        },
      },
    }),
    { id: 'u1', chatId: id, role: 'user' as const, content: 'Some limits.', createdAt: 2 },
    assistant('a2', 3, {
      tutor: {
        planProposal: { plan: legacyPlan(), status: 'approved', requestedAt: 3, resolvedAt: 4 },
      },
    }),
    assistant('a3', 5, {
      hiddenContent: 'Tutor Recap:\nQuiz\n\nTutor Data JSON:\n{"mcq":[{"correct":1}]}',
      learnerModel: model(2_000, 0.55),
      planUpdates: { masteryChanges: [{ nodeId: 'derivatives', from: 0.45, to: 0.55 }] },
      tutor: {
        title: 'Power rule',
        mcq: [
          { id: 'q1', question: 'd/dx x^2?', choices: ['x', '2x'], correct: 1 },
          { id: 'q2', question: 'd/dx x^3?', choices: ['3x^2', 'x^2'], correct: 0 },
        ],
        attempts: {
          mcq: { q1: { choice: 1, done: true, correct: true }, q2: { choice: 1, done: true } },
        },
      },
    }),
    assistant('a4', 7, {
      tutor: {
        diagnostic: {
          diagnosticId: 'diag-1',
          topic: 'Rates of change',
          depth: 'quick',
          status: 'pending',
          items: [
            { id: 'd1', question: 'Slope of y=2x?', choices: ['1', '2'], correct: 1 },
            { id: 'd2', question: 'Slope of y=3?', choices: ['0', '3'], correct: 0 },
            { id: 'd3', question: 'Slope of y=x?', choices: ['1', '0'], correct: 0 },
          ],
        },
        attempts: { mcq: { d1: { choice: 1, done: true, correct: true } } },
      },
    }),
    assistant('a5', 9, {
      tutor: {
        mcq: [
          { id: 'q3', question: 'd/dx 5x?', choices: ['5', 'x'], correct: 0 },
          { id: 'q4', question: 'd/dx 7?', choices: ['0', '7'], correct: 0 },
        ],
        attempts: { mcq: { q3: { choice: 0, done: true, correct: true } } },
      },
    }),
  ].map((m) => ({ ...m, chatId: id }));
  return { chat, messages };
}

async function seedLegacy(id: string) {
  const { chat, messages } = legacyChat(id);
  for (const message of messages) await repository.saveMessage(message);
  const store = newStore();
  store.setState({ chats: [chat] });
  return { store, chat, messages };
}

// ---------------------------------------------------------------- legacy import

test('legacy import turns a pre-rebuild tutor chat into one log, read once', async () => {
  const id = chatId('legacy');
  const { store, chat } = await seedLegacy(id);

  const session = await store.getState().ensureTutorSession(id);
  const { events, state } = session;

  // Cards first, in transcript order, each on its message; the import marker last.
  assert.deepEqual(
    events.map((e) => `${e.type}:${e.messageId ?? '-'}`),
    [
      'intake_asked:a1',
      'intake_answered:a1',
      'proposal_imported:a2',
      'quiz_given:a3',
      'quiz_answered:a3',
      'quiz_answered:a3',
      'diagnostic_given:a4',
      'card_dismissed:-',
      'quiz_given:a5',
      'quiz_answered:a5',
      'legacy_imported:-',
    ],
  );
  assert.deepEqual(
    events.map((e) => e.seq),
    events.map((_, i) => i + 1),
  );

  // The plan and the newer of the two learner models (the message snapshot).
  assert.equal(state.phase, 'teaching');
  assert.equal(state.currentNodeId, 'derivatives');
  assert.equal(state.mastery.derivatives.confidence, 0.55);
  assert.equal(state.mastery.derivatives.baseline, 0.55);
  assert.equal(state.mastery.limits.confidence, 0.85);
  assert.equal(state.mastery['chain-rule'].confidence, 0.3);

  // Old answers are records, not new evidence: the imported model already counts them.
  assert.ok(!events.some((e) => e.type === 'evidence_recorded'));
  const firstQuiz = state.quizzes['legacy-quiz-a3'];
  assert.equal(firstQuiz.messageId, 'a3');
  assert.deepEqual(firstQuiz.answers, {
    q1: { choice: 1, correct: true },
    q2: { choice: 1, correct: false },
  });
  assert.equal(state.intakes['legacy-intake-a1'].responses?.level[0], 'Some');

  // An abandoned card closes; the one on the last reply is still the learner's to finish.
  assert.equal(state.diagnostics['diag-1'].dismissed, true);
  assert.deepEqual(state.awaiting, { kind: 'quiz', id: 'legacy-quiz-a5' });
  // The old approved proposal is history, not a pending card, and still renders.
  assert.equal(state.proposal, undefined);
  assert.equal(cardsForMessage(session, 'a2').proposal?.status, 'approved');
  assert.equal(cardsForMessage(session, 'a2').proposal?.plan.goal, legacyPlan().goal);
  // Old quizzes are on the current topic but spend none of its budget.
  assert.equal(remainingBudgets(state).quizzesLeft, 3);

  // Persisted, and the legacy fields are left exactly as they were.
  const stored = await repository.loadTutorEvents(id);
  assert.deepEqual(
    stored.map((e) => e.id),
    events.map((e) => e.id),
  );
  assert.deepEqual(store.getState().chats[0].settings.features.tutor, chat.settings.features.tutor);

  // A second load reads the log and does not import again.
  const again = newStore();
  again.setState({ chats: [chat] });
  const reloaded = await again.getState().ensureTutorSession(id);
  assert.deepEqual(
    reloaded.events.map((e) => e.id),
    events.map((e) => e.id),
  );
});

test('a pending legacy proposal comes back as the pending proposal on its message', async () => {
  const id = chatId('proposal');
  const chat = makeChat(id);
  const plan = legacyPlan();
  plan.nodes = plan.nodes.map((n) => ({ ...n, status: 'not_started' as const }));
  await repository.saveMessage({
    ...assistant('p1', 1, {
      tutor: {
        planProposal: {
          plan,
          status: 'pending',
          requestedAt: 1,
          confirmationMessage: 'Starts from limits.',
        },
      },
    }),
    chatId: id,
  });
  const store = newStore();
  store.setState({ chats: [chat] });

  const { state, events } = await store.getState().ensureTutorSession(id);
  // The proposal on its message; the import marker, on none, after it.
  assert.deepEqual(
    events.map((e) => `${e.type}:${e.messageId ?? '-'}`),
    ['plan_proposed:p1', 'legacy_imported:-'],
  );
  assert.equal(state.phase, 'proposal');
  assert.equal(state.proposal?.messageId, 'p1');
  assert.equal(state.proposal?.rationale, 'Starts from limits.');
  assert.equal(state.proposal?.revision, false);

  const approved = await store
    .getState()
    .dispatchTutor(
      id,
      { by: 'learner', type: 'approve_plan', proposalId: state.proposal!.proposalId },
      { by: 'learner', messageId: 'p1' },
    );
  assert.equal(approved.ok, true);
  assert.equal(store.getState().tutorSessions[id].state.currentNodeId, 'limits');
});

test('regenerating the reply with a pending legacy revision takes back only the revision', async () => {
  const id = chatId('legacy-retract');
  const chat = makeChat(id, { learningPlan: legacyPlan(), learnerModel: model(1_000, 0.6) });
  const revised = legacyPlan();
  revised.nodes.push({
    id: 'integrals',
    name: 'Integrals',
    objectives: ['Integrate'],
    prerequisites: [],
    status: 'not_started',
  });
  await repository.saveMessage({
    ...assistant('r1', 1, {
      tutor: { planProposal: { plan: revised, status: 'pending', requestedAt: 1 } },
    }),
    chatId: id,
  });
  const store = newStore();
  store.setState({ chats: [chat] });
  const before = await store.getState().ensureTutorSession(id);
  assert.equal(before.state.proposal?.messageId, 'r1');
  assert.equal(before.state.proposal?.revision, true);

  await notifyReplyRetracted({ get: store.getState }, { chatId: id, messageId: 'r1' });
  const { state } = store.getState().tutorSessions[id];
  assert.equal(state.proposal, undefined, 'the revision went with its reply');
  assert.equal(state.plan?.goal, legacyPlan().goal, 'the imported plan stays');
  assert.equal(state.mastery.derivatives.confidence, 0.6, 'and so does the imported mastery');
  assert.equal(state.phase, 'teaching');
});

test('branching an imported legacy chat keeps the imported plan and mastery', async () => {
  const id = chatId('legacy-branch');
  const { store, messages } = await seedLegacy(id);
  store.setState((s) => appendMessagesToChat(s, id, messages));
  const source = await store.getState().ensureTutorSession(id);
  assert.ok(source.state.plan);

  // From a1, whose events come long before the import marker.
  await store.getState().branchChatFromMessage('a1');
  const branchId = store.getState().selectedChatId!;
  assert.notEqual(branchId, id);
  const branch = await store.getState().ensureTutorSession(branchId);
  assert.equal(branch.state.plan?.goal, legacyPlan().goal);
  assert.equal(branch.state.mastery.derivatives.confidence, 0.55);
  assert.ok(branch.events.some((e) => e.type === 'legacy_imported'));
  assert.ok(!branch.events.some((e) => e.type === 'quiz_given'), 'later cards stay behind');
});

test('a branch whose share of the log is empty never imports the settings it copied', async () => {
  const id = chatId('stale-branch');
  // Legacy fields still on the chat, but its log already exists (it was imported long ago).
  const chat = makeChat(id, { learningPlan: legacyPlan(), learnerModel: model(1_000, 0.6) });
  const store = newStore();
  store.setState({ chats: [chat] });
  const early = [
    createUserMessage({ id: `${id}-u1`, chatId: id, content: 'Hi', createdAt: 1 }),
    createAssistantMessage({ id: `${id}-m1`, chatId: id, content: 'Hello', createdAt: 2 }),
    createUserMessage({ id: `${id}-u2`, chatId: id, content: 'Teach me', createdAt: 3 }),
    createAssistantMessage({ id: `${id}-m2`, chatId: id, content: 'Plan', createdAt: 4 }),
  ];
  for (const message of early) await repository.saveMessage(message);
  store.setState((s) => appendMessagesToChat(s, id, early));
  await repository.appendTutorEvents([
    {
      id: `${id}-e1`,
      chatId: id,
      seq: 1,
      at: 5,
      by: 'tutor',
      messageId: `${id}-m2`,
      type: 'plan_proposed',
      proposalId: 'p1',
      revision: false,
      plan: { ...legacyPlan(), goal: 'A new goal' },
    },
  ]);

  await store.getState().branchChatFromMessage(`${id}-m1`);
  const branchId = store.getState().selectedChatId!;
  const branch = await store.getState().ensureTutorSession(branchId);
  assert.deepEqual(branch.events, []);
  assert.equal(branch.state.plan, undefined);
  assert.deepEqual(await repository.loadTutorEvents(branchId), []);
});

test('a chat with no tutor history gets an empty log and no import', async () => {
  const id = chatId('plain');
  await repository.saveMessage({
    id: `${id}-m`,
    chatId: id,
    role: 'user',
    content: 'hi',
    createdAt: 1,
  });
  const store = newStore();
  store.setState({ chats: [makeChat(id)] });
  const session = await store.getState().ensureTutorSession(id);
  assert.equal(session.loaded, true);
  assert.deepEqual(session.events, []);
  assert.equal(session.state.phase, 'intake');
  assert.deepEqual(await repository.loadTutorEvents(id), []);
});

test('malformed stored events are dropped on load, never folded', async () => {
  const id = chatId('malformed');
  await repository.appendTutorEvents([
    { id: `${id}-1`, chatId: id, seq: 1, at: 1, by: 'tutor', type: 'topic_started' },
    { id: `${id}-2`, chatId: id, seq: 2, at: 1, by: 'tutor', type: 'from_the_future', x: 1 },
    {
      id: `${id}-3`,
      chatId: id,
      seq: 3,
      at: 1,
      by: 'tutor',
      type: 'review_flagged',
      nodeId: 'limits',
      flagged: true,
    },
  ]);
  const store = newStore();
  store.setState({ chats: [makeChat(id)] });
  const session = await store.getState().ensureTutorSession(id);
  assert.deepEqual(
    session.events.map((e) => e.id),
    [`${id}-3`],
  );
});

// ---------------------------------------------------------------- dispatch

async function teachingChat() {
  const id = chatId('teaching');
  const store = newStore();
  store.setState({ chats: [makeChat(id)] });
  const { dispatchTutor } = store.getState();
  const proposed = await dispatchTutor(
    id,
    { by: 'tutor', type: 'propose_plan', ...CALCULUS },
    { by: 'tutor', messageId: 'm1' },
  );
  assert.equal(proposed.ok, true);
  const proposalId = store.getState().tutorSessions[id].state.proposal!.proposalId;
  await dispatchTutor(id, { by: 'learner', type: 'approve_plan', proposalId }, { by: 'learner' });
  return { id, store };
}

test('concurrent dispatches for one chat run in turn and lose nothing', async () => {
  const { id, store } = await teachingChat();
  const { dispatchTutor } = store.getState();

  // Tool calls in one turn, and a click racing them.
  const results = await Promise.all([
    dispatchTutor(
      id,
      {
        by: 'tutor',
        type: 'record_evidence',
        kind: 'applied',
        note: 'Solved one',
        source: 'observation',
      },
      { by: 'tutor', messageId: 'm2' },
    ),
    dispatchTutor(
      id,
      {
        by: 'tutor',
        type: 'record_evidence',
        kind: 'explained',
        note: 'Explained why',
        source: 'observation',
      },
      { by: 'tutor', messageId: 'm2' },
    ),
    dispatchTutor(
      id,
      { by: 'learner', type: 'adjust_mastery', nodeId: 'limits', setTo: 0.9 },
      { by: 'learner' },
    ),
    dispatchTutor(
      id,
      { by: 'tutor', type: 'complete_topic', how: 'mastered' },
      { by: 'tutor', messageId: 'm2' },
    ),
  ]);
  assert.deepEqual(
    results.map((r) => r.ok),
    [true, true, true, true],
  );

  const { events, state } = store.getState().tutorSessions[id];
  const seqs = events.map((e) => e.seq);
  assert.deepEqual(
    seqs,
    seqs.map((_, i) => i + 1),
    'one gapless sequence',
  );
  assert.equal(new Set(events.map((e) => e.id)).size, events.length);
  // Each saw the one before: the learner's 90% let the topic complete as mastered.
  assert.deepEqual(
    state.mastery.limits.evidence.map((e) => e.kind),
    ['applied', 'explained', 'adjusted'],
  );
  assert.equal(state.phase, 'interlude');
  // Every result's `before` is the state the previous dispatch produced.
  assert.ok(
    results[2].ok && results[1].ok && results[2].before.lastSeq === results[1].state.lastSeq,
  );

  // Memory and disk agree.
  const stored = await repository.loadTutorEvents(id);
  assert.deepEqual(
    stored.map((e) => e.id),
    events.map((e) => e.id),
  );
});

test('a dispatch before the first load waits for it instead of racing it', async () => {
  const id = chatId('cold');
  await repository.appendTutorEvents([
    {
      id: `${id}-1`,
      chatId: id,
      seq: 1,
      at: 1,
      by: 'tutor',
      type: 'intake_asked',
      intakeId: 'i1',
      questions: [
        { id: 'q1', question: 'Goal?', options: [{ label: 'A' }, { label: 'B' }] },
        { id: 'q2', question: 'Level?', options: [{ label: 'A' }, { label: 'B' }] },
      ],
    },
  ]);
  const store = newStore();
  store.setState({ chats: [makeChat(id)] });
  const result = await store
    .getState()
    .dispatchTutor(
      id,
      { by: 'learner', type: 'answer_intake', intakeId: 'i1', responses: { q1: ['A'] } },
      { by: 'learner' },
    );
  assert.equal(result.ok, true);
  const events = store.getState().tutorSessions[id].events;
  assert.deepEqual(
    events.map((e) => `${e.seq}:${e.type}`),
    ['1:intake_asked', '2:intake_answered'],
  );
});

test('a refused command changes nothing, and the actor must match the command', async () => {
  const { id, store } = await teachingChat();
  const before = store.getState().tutorSessions[id];

  const refused = await store
    .getState()
    .dispatchTutor(id, { by: 'tutor', type: 'start_topic', nodeId: 'nope' }, { by: 'tutor' });
  assert.equal(refused.ok, false);
  assert.equal(!refused.ok && refused.error.code, 'unknown_node');

  const mismatched = await store.getState().dispatchTutor(
    id,
    { by: 'learner', type: 'flag_review', nodeId: 'limits', flagged: true },
    {
      by: 'tutor',
    },
  );
  assert.equal(mismatched.ok, false);
  assert.equal(store.getState().tutorSessions[id], before);
});

test('a dispatch decides only after the one before it is on disk', async () => {
  const { id, store } = await teachingChat();
  const { dispatchTutor } = store.getState();
  const original = repository.appendTutorEvents;
  const written: number[] = [];
  let calls = 0;
  repository.appendTutorEvents = async (events) => {
    calls += 1;
    // The first write is slow; a racing second one must still land after it.
    if (calls === 1) await new Promise((resolve) => setTimeout(resolve, 20));
    await original(events);
    written.push(...events.map((e) => e.seq));
  };
  try {
    await Promise.all([
      dispatchTutor(
        id,
        { by: 'tutor', type: 'note_misconception', description: 'Plugs in before simplifying' },
        { by: 'tutor', messageId: 'm3' },
      ),
      dispatchTutor(
        id,
        { by: 'learner', type: 'flag_review', nodeId: 'limits', flagged: true },
        { by: 'learner' },
      ),
    ]);
  } finally {
    repository.appendTutorEvents = original;
  }
  assert.deepEqual(
    written,
    [...written].sort((a, b) => a - b),
    'the log reaches disk in order',
  );
  assert.equal(written.length, 2);
});

test('a reply that put up a card has content even with no words; a retracted one does not', async () => {
  const { id, store } = await teachingChat();
  const reply = (messageId: string) =>
    ({ id: messageId, chatId: id, role: 'assistant', content: '', createdAt: 1 }) as Message;
  assert.equal(messageHasModuleContent(store.getState(), reply('m1')), true, 'the plan card');
  assert.equal(messageHasModuleContent(store.getState(), reply('m2')), false);
  await store
    .getState()
    .dispatchTutor(
      id,
      { by: 'tutor', type: 'give_quiz', items: QUIZ_ITEMS },
      { by: 'tutor', messageId: 'm2' },
    );
  assert.equal(messageHasModuleContent(store.getState(), reply('m2')), true, 'the quiz card');
  await notifyReplyRetracted({ get: store.getState }, { chatId: id, messageId: 'm2' });
  assert.equal(messageHasModuleContent(store.getState(), reply('m2')), false);
});

// ---------------------------------------------------------------- retraction and deletion

test('retracting a reply through the module hook takes back its quiz and answers', async () => {
  const { id, store } = await teachingChat();
  const { dispatchTutor } = store.getState();
  await dispatchTutor(
    id,
    { by: 'tutor', type: 'give_quiz', items: QUIZ_ITEMS },
    { by: 'tutor', messageId: 'm2' },
  );
  const quizId = store.getState().tutorSessions[id].state.awaiting!.id;
  await dispatchTutor(
    id,
    { by: 'learner', type: 'answer_quiz_item', quizId, itemId: 'q1', choice: 0 },
    { by: 'learner', messageId: 'm2' },
  );
  assert.equal(store.getState().tutorSessions[id].state.mastery.limits.evidence.length, 1);

  await notifyReplyRetracted({ get: store.getState }, { chatId: id, messageId: 'm2' });
  const { state, events } = store.getState().tutorSessions[id];
  assert.equal(events.at(-1)?.type, 'reply_retracted');
  assert.equal(state.quizzes[quizId], undefined);
  assert.equal(state.mastery.limits.evidence.length, 0);
  assert.equal(remainingBudgets(state).quizzesLeft, 3);

  // On disk too, so a reload folds to the same state.
  const reloaded = newStore();
  reloaded.setState({ chats: store.getState().chats });
  const again = await reloaded.getState().ensureTutorSession(id);
  assert.deepEqual(again.state, state);

  // A reply with nothing in the log leaves the log alone.
  assert.equal(await store.getState().retractTutorReply(id, 'unrelated'), false);
  assert.equal(store.getState().tutorSessions[id].events.length, events.length);
});

test('deleting a chat drops its session from memory', async () => {
  const { id, store } = await teachingChat();
  assert.ok(store.getState().tutorSessions[id]);
  await store.getState().deleteChat(id);
  assert.equal(store.getState().tutorSessions[id], undefined);
  assert.deepEqual(await repository.loadTutorEvents(id), []);
  // Dropping an unknown chat is harmless.
  notifyChatDeleted({ get: store.getState }, 'never-loaded');
});

// ---------------------------------------------------------------- transcript order

/** A teaching chat with a transcript: u1, m1 (plan), u2 (ledger), m2 (quiz), u3, m3. */
async function chatWithTranscript() {
  const { id, store } = await teachingChat();
  const { dispatchTutor } = store.getState();
  await dispatchTutor(
    id,
    { by: 'tutor', type: 'give_quiz', items: QUIZ_ITEMS },
    { by: 'tutor', messageId: 'm2' },
  );
  const quizId = store.getState().tutorSessions[id].state.awaiting!.id;
  await dispatchTutor(
    id,
    { by: 'learner', type: 'answer_quiz_item', quizId, itemId: 'q1', choice: 0 },
    { by: 'learner', messageId: 'm2' },
  );
  const seenByM3 = store.getState().tutorSessions[id].state.lastSeq;
  await dispatchTutor(
    id,
    { by: 'tutor', type: 'record_evidence', kind: 'applied', note: 'Later', source: 'observation' },
    { by: 'tutor', messageId: 'm3' },
  );
  let clock = 1_000;
  const user = (msgId: string, content: string, ledger = false) =>
    createUserMessage({ id: msgId, chatId: id, content, createdAt: (clock += 1), ledger });
  const reply = (msgId: string, tutorSeq?: number) => ({
    ...createAssistantMessage({
      id: msgId,
      chatId: id,
      content: `Reply ${msgId}`,
      createdAt: (clock += 1),
    }),
    ...(tutorSeq != null ? { tutorSeq } : {}),
  });
  const messages: Message[] = [
    user('u1', 'Teach me'),
    reply('m1', 0),
    user('u2', 'Approved the plan', true),
    reply('m2', 2),
    user('u3', 'Why?'),
    reply('m3', seenByM3),
  ];
  store.setState((s) => ({ ...appendMessagesToChat(s, id, messages), selectedChatId: id }));
  for (const message of messages) await repository.saveMessage(message);
  return { id, store, quizId };
}

test('in a tutor chat only the latest exchange can be regenerated or edited and rerun', async () => {
  const { id, store } = await chatWithTranscript();
  const can = (messageId: string) => canRedoReply(store.getState(), id, messageId);
  assert.deepEqual(['u1', 'm1', 'u2', 'm2', 'u3', 'm3'].map(can), [
    false,
    false,
    false,
    false,
    true,
    true,
  ]);

  // An edit that would rerun an earlier reply is refused outright.
  await store.getState().editUserMessage('u1', 'Something else', { rerun: true });
  assert.equal(store.getState().messagesById.u1.content, 'Teach me');

  // An ordinary chat keeps redo everywhere.
  const plain = makeChat(chatId('plain'), { enabled: false });
  store.setState((s) => ({
    chats: [...s.chats, plain],
    ...appendMessagesToChat(s, plain.id, [
      createUserMessage({ id: 'p-u1', chatId: plain.id, content: 'a', createdAt: 1 }),
      createAssistantMessage({ id: 'p-m1', chatId: plain.id, content: 'b', createdAt: 2 }),
      createUserMessage({ id: 'p-u2', chatId: plain.id, content: 'c', createdAt: 3 }),
    ]),
  }));
  assert.equal(canRedoReply(store.getState(), plain.id, 'p-m1'), true);
});

test('branching a tutor chat copies its log up to the branch point', async () => {
  const { id, store, quizId } = await chatWithTranscript();
  await store.getState().branchChatFromMessage('m2');

  const branchId = store.getState().selectedChatId!;
  assert.notEqual(branchId, id);
  const copies = getMessagesForChat(store.getState(), branchId);
  assert.equal(copies.length, 4);
  const [, m1Copy, , m2Copy] = copies;
  assert.notEqual(m2Copy.id, 'm2');

  const session = store.getState().tutorSessions[branchId];
  assert.ok(session?.loaded);
  assert.ok(session.events.every((e) => e.chatId === branchId));
  assert.ok(
    !session.events.some((e) => e.type === 'evidence_recorded' && e.by === 'tutor'),
    "m3's observation stays behind",
  );
  assert.equal(session.state.quizzes[quizId].messageId, m2Copy.id);
  assert.deepEqual(Object.keys(session.state.quizzes[quizId].answers), ['q1']);
  assert.ok(cardsForMessage(session, m2Copy.id).quiz, 'the quiz card renders on the copy');
  assert.equal(session.state.proposal, undefined);
  assert.equal(
    store.getState().tutorSessions[id].state.mastery.limits.evidence.length,
    session.state.mastery.limits.evidence.length + 1,
    'the source keeps what came after the branch point',
  );
  assert.ok(session.events.some((e) => e.messageId === m1Copy.id));

  // On disk, so the branch reloads to the same state.
  const reloaded = newStore();
  reloaded.setState({ chats: store.getState().chats });
  const again = await reloaded.getState().ensureTutorSession(branchId);
  assert.deepEqual(again.state, session.state);
});
