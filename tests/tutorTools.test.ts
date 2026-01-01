import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTutorToolCall } from '@/lib/agent/tools';
import { getTutorToolDefinitions } from '@/lib/agent/tutor';
import type { StoreSetter } from '@/lib/agent/types';
import { validateLearningPlan } from '@/lib/learningPlan/validate';
import { buildMessageIndex } from '@/lib/messages/indexing';

const createTutorHarness = () => {
  const chat = {
    id: 'chat-test',
    settings: {},
  } as any;
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

test('tutor tool definitions expose agentic planning tools', () => {
  const toolNames = getTutorToolDefinitions().map((tool: any) => tool.function.name as string);
  const expected = [
    'ask_student_question',
    'create_diagnostic',
    'generate_plan',
    'update_plan',
    'get_plan_suggestions',
    'assess_answer',
    'update_learner_model',
    'quiz_mcq',
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
    name: 'quiz_mcq',
    args: {
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
    name: 'quiz_fill_blank',
    args: {
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

test('plan tools persist a valid learning plan from tool payloads', async () => {
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

  for (const toolName of ['generate_plan', 'update_plan'] as const) {
    const outcome = await applyTutorToolCall({
      name: toolName,
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
    assert.ok(plan, `expected plan proposal to be stored for ${toolName}`);
    const validation = validateLearningPlan(plan);
    assert.equal(validation.valid, true);
    assert.deepEqual(plan.nodes[0].children, ['derivatives']);
  }
});

test('plan suggestions append normalized entries', async () => {
  const { chat, assistantMessage, state, set, get } = createTutorHarness();
  const outcome = await applyTutorToolCall({
    name: 'get_plan_suggestions',
    args: {
      suggestions: [
        {
          action: 'Add a practice checkpoint after limits',
          priority: 'medium',
          rationale: 'Validate understanding before derivatives.',
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

  assert.equal(outcome.handled, true);
  const suggestions = state.ui.tutor.byMessageId?.['assistant-1']?.planSuggestions;
  assert.ok(Array.isArray(suggestions));
  assert.equal(suggestions.length, 1);
});

test('quiz and flashcard tools accept schema-aligned payloads', async () => {
  const { chat, assistantMessage, state, set, get } = createTutorHarness();
  const cases = [
    {
      name: 'quiz_mcq' as const,
      key: 'mcq',
      args: {
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
      name: 'quiz_fill_blank' as const,
      key: 'fillBlank',
      args: {
        items: [
          {
            prompt: '2 + 2 = ____',
            answer: '4',
          },
        ],
      },
    },
    {
      name: 'quiz_open_ended' as const,
      key: 'openEnded',
      args: {
        items: [
          {
            prompt: 'Explain the chain rule.',
            sample_answer: 'Differentiate outer, multiply by inner derivative.',
          },
        ],
      },
    },
    {
      name: 'flashcards' as const,
      key: 'flashcards',
      args: {
        items: [
          {
            front: 'Derivative of x^2',
            back: '2x',
            hint: 'Power rule',
          },
        ],
      },
    },
  ];

  for (const entry of cases) {
    const outcome = await applyTutorToolCall({
      name: entry.name,
      args: entry.args,
      chat,
      chatId: 'chat-test',
      assistantMessage,
      set,
      get,
      persistMessage: async () => Promise.resolve(),
    });
    assert.equal(outcome.handled, true, `expected ${entry.name} to be handled`);
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
