import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTutorToolCall } from '@/lib/agent/tools';
import { getTutorToolDefinitions } from '@/lib/agent/tutor';
import type { StoreSetter } from '@/lib/agent/types';
import { validateLearningPlan } from '@/lib/learning-plan/validate';
import { buildMessageIndex } from '@/lib/messages/indexing';
import type { Chat } from '@/lib/types';

const createTutorHarness = () => {
  const chat: Chat = {
    id: 'chat-test',
    title: 'Tutor test',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    settings: {
      modelId: 'model-x',
      generation: {},
      ui: {
        showThinkingByDefault: false,
        showStats: false,
        showToolCallLog: false,
        showDebugRawJson: true,
      },
      features: {
        search: { enabled: false, provider: 'openrouter' },
        tutor: { enabled: true },
      },
    },
  };
  const assistantMessage = {
    id: 'assistant-1',
    chatId: 'chat-test',
    role: 'assistant',
    content: '',
    createdAt: Date.now(),
  } as any;
  const { messagesById, messageIdsByChatId } = buildMessageIndex({
    'chat-test': [assistantMessage],
  });
  const state: any = {
    messagesById,
    messageIdsByChatId,
    ui: {
      tutor: { byMessageId: {} },
    },
  };
  const set: StoreSetter = (updater: any) => {
    const result = typeof updater === 'function' ? updater(state) : updater;
    if (!result) return;
    if (result.messagesById) {
      state.messagesById = {
        ...state.messagesById,
        ...result.messagesById,
      };
    }
    if (result.messageIdsByChatId) {
      state.messageIdsByChatId = {
        ...state.messageIdsByChatId,
        ...result.messageIdsByChatId,
      };
    }
    if (result.ui) {
      state.ui = {
        ...state.ui,
        ...result.ui,
      };
    }
  };
  const get = () => state;
  return { chat, assistantMessage, state, set, get };
};

test('tutor tool definitions expose consolidated planning tools', () => {
  const toolNames = getTutorToolDefinitions().map((tool: any) => tool.function.name as string);
  const expected = [
    'ask_student_question',
    'create_diagnostic',
    'learning_plan',
    'record_learning',
    'advance_topic',
    'quiz',
  ];
  for (const name of expected) {
    assert.ok(toolNames.includes(name), `expected tutor tool definitions to include ${name}`);
  }
});

test('ask_student_question tool stores questionnaire for the message', async () => {
  const { chat, assistantMessage, state, set, get } = createTutorHarness();
  let persisted = false;

  const outcome = await applyTutorToolCall({
    name: 'ask_student_question',
    args: {
      questions: [
        {
          question: 'What is your primary goal?',
          options: [
            { label: 'Exam prep', description: 'I have a specific test coming up.' },
            { label: 'Career skills', description: 'I need this for work.' },
          ],
        },
      ],
    },
    chat,
    chatId: 'chat-test',
    assistantMessage,
    set,
    get,
    persistMessage: async () => {
      persisted = true;
    },
  });

  assert.equal(outcome.handled, true);
  assert.equal(outcome.usedContent, true);
  assert.ok(persisted, 'expected tutor state to be persisted');

  const stored = state.ui.tutor.byMessageId?.['assistant-1']?.questionnaire;
  assert.ok(stored, 'questionnaire should be stored on tutor state');
  assert.equal(stored.status, 'awaiting');
  assert.equal(stored.questions.length, 1);
  assert.equal(stored.questions[0].question, 'What is your primary goal?');
});

test('content tools replace previous tutor widgets to enforce one active payload', async () => {
  const { chat, assistantMessage, state, set, get } = createTutorHarness();
  await applyTutorToolCall({
    name: 'quiz',
    args: {
      type: 'mcq',
      title: 'Round one',
      items: [
        {
          id: 'mcq-1',
          question: 'First?',
          choices: ['a', 'b'],
          correct: 0,
        },
      ],
    },
    chat,
    chatId: 'chat-test',
    assistantMessage,
    set,
    get,
    persistMessage: async () => Promise.resolve(),
  });

  await applyTutorToolCall({
    name: 'quiz',
    args: {
      type: 'fill_blank',
      title: 'Second',
      items: [
        {
          id: 'blank-1',
          prompt: '2 + 2 = ____',
          answer: '4',
        },
      ],
    },
    chat,
    chatId: 'chat-test',
    assistantMessage,
    set,
    get,
    persistMessage: async () => Promise.resolve(),
  });

  const tutorState = state.ui.tutor.byMessageId?.['assistant-1'];
  assert.ok(Array.isArray(tutorState?.fillBlank));
  assert.equal(Array.isArray(tutorState?.mcq), false);
  assert.equal(tutorState?.attempts, undefined);
});

test('learning_plan tool persists a valid learning plan from tool payloads', async () => {
  const { chat, assistantMessage, state, set, get } = createTutorHarness();
  const args = {
    plan: {
      goal: 'Master calculus fundamentals',
      metadata: { estimatedHours: 12, difficulty: 'intermediate', prerequisites: ['algebra'] },
      nodes: [
        {
          id: 'limits',
          name: 'Limits',
          objectives: ['Define a limit', 'Evaluate simple limits'],
          prerequisites: [],
          status: 'not_started',
          estimatedMinutes: 45,
          resources: [{ type: 'reading', title: 'Limits primer', url: 'https://example.com' }],
          children: ['derivatives'],
        },
        {
          id: 'derivatives',
          name: 'Derivatives',
          objectives: ['Apply derivative rules'],
          prerequisites: ['limits'],
          status: 'not_started',
        },
      ],
    },
    requiresConfirmation: true,
    confirmationMessage: 'Let me know if you want to tweak anything.',
  };

  const outcome = await applyTutorToolCall({
    name: 'learning_plan',
    args,
    chat,
    chatId: 'chat-test',
    assistantMessage,
    set,
    get,
    persistMessage: async () => Promise.resolve(),
  });

  assert.equal(outcome.handled, true);
  const plan = state.ui.tutor.byMessageId?.['assistant-1']?.planProposal?.plan;
  assert.ok(plan, 'expected plan proposal to be stored');
  const validation = validateLearningPlan(plan);
  assert.equal(validation.valid, true);
  assert.deepEqual(plan.nodes[0].children, ['derivatives']);
});

test('quiz tool accepts all types with schema-aligned payloads', async () => {
  const { chat, assistantMessage, state, set, get } = createTutorHarness();
  const cases = [
    {
      type: 'mcq',
      key: 'mcq',
      args: {
        type: 'mcq',
        items: [
          {
            question: '1 + 1 = ?',
            choices: ['1', '2'],
            correct: 1,
          },
        ],
      },
    },
    {
      type: 'fill_blank',
      key: 'fillBlank',
      args: {
        type: 'fill_blank',
        items: [
          {
            prompt: '2 + 2 = ____',
            answer: '4',
          },
        ],
      },
    },
    {
      type: 'open_ended',
      key: 'openEnded',
      args: {
        type: 'open_ended',
        items: [
          {
            prompt: 'Explain the chain rule.',
            sample_answer: 'Differentiate outer, multiply by inner derivative.',
          },
        ],
      },
    },
  ];

  for (const entry of cases) {
    const outcome = await applyTutorToolCall({
      name: 'quiz',
      args: entry.args,
      chat,
      chatId: 'chat-test',
      assistantMessage,
      set,
      get,
      persistMessage: async () => Promise.resolve(),
    });
    assert.equal(outcome.handled, true, `expected quiz type ${entry.type} to be handled`);
    const tutorState = state.ui.tutor.byMessageId?.['assistant-1'];
    assert.ok(Array.isArray(tutorState?.[entry.key]), `expected ${entry.key} to be stored`);
  }
});

test('diagnostic tool stores items from schema-aligned payloads', async () => {
  const { chat, assistantMessage, state, set, get } = createTutorHarness();
  const outcome = await applyTutorToolCall({
    name: 'create_diagnostic',
    args: {
      topic: 'Algebra foundations',
      depth: 'quick',
      quiz: {
        type: 'mcq',
        items: [
          {
            question: 'Solve for x: 2x = 6',
            choices: ['1', '2', '3'],
            correct: 2,
          },
          {
            question: 'Simplify: x + x',
            choices: ['x', '2x', 'x^2'],
            correct: 1,
          },
          {
            question: 'What is 5 - 2?',
            choices: ['2', '3', '4'],
            correct: 1,
          },
        ],
      },
    },
    chat,
    chatId: 'chat-test',
    assistantMessage,
    set,
    get,
    persistMessage: async () => Promise.resolve(),
  });

  assert.equal(outcome.handled, true);
  const diagnostic = state.ui.tutor.byMessageId?.['assistant-1']?.diagnostic;
  assert.ok(diagnostic);
  assert.equal(diagnostic.items.length, 3);
  assert.equal(diagnostic.status, 'pending');
});
