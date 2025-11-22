import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTutorToolCall } from '@/lib/agent/tools';
import { getTutorToolDefinitions } from '@/lib/agent/tutor';
import type { StoreSetter } from '@/lib/agent/types';

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
    assert.ok(
      toolNames.includes(name),
      `expected tutor tool definitions to include ${name}`,
    );
  }
});

test('ask_student_question tool stores questionnaire for the message', async () => {
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

  const state: any = {
    messages: {
      'chat-test': [assistantMessage],
    },
    ui: {
      tutorByMessageId: {},
    },
  };

  const set: StoreSetter = (updater: any) => {
    const result = typeof updater === 'function' ? updater(state) : updater;
    if (!result) return;
    if (result.messages) {
      state.messages = {
        ...state.messages,
        ...result.messages,
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

  const stored = state.ui.tutorByMessageId?.['assistant-1']?.questionnaire;
  assert.ok(stored, 'questionnaire should be stored on tutor state');
  assert.equal(stored.status, 'awaiting');
  assert.equal(stored.questions.length, 1);
  assert.equal(stored.questions[0].question, 'What is your primary goal?');
});

test('content tools replace previous tutor widgets to enforce one active payload', async () => {
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

  const state: any = {
    messages: {
      'chat-test': [assistantMessage],
    },
    ui: {
      tutorByMessageId: {},
    },
  };

  const set: StoreSetter = (updater: any) => {
    const result = typeof updater === 'function' ? updater(state) : updater;
    if (!result) return;
    if (result.messages) {
      state.messages = {
        ...state.messages,
        ...result.messages,
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

  const tutorState = state.ui.tutorByMessageId?.['assistant-1'];
  assert.ok(Array.isArray(tutorState?.fillBlank));
  assert.equal(Array.isArray(tutorState?.mcq), false);
  assert.equal(tutorState?.attempts, undefined);
});
