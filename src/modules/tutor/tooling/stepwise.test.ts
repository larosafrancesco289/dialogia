// The stepper end to end with a scripted tutor model: a chat created, then reopened from its
// folder for every move with the in-memory database emptied in between, as a fresh process
// finds it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createPipelineClient } from '@/lib/agent/pipelineClient';
import { repository } from '@/lib/db';
import type { ModelMessage, ToolCall } from '@/lib/transport/contracts';
import type { TransportStreamParams } from '@/lib/transport/types';
import { StepRun } from '@/modules/tutor/tooling/stepwise';

let ids = 0;
const call = (name: string, args: Record<string, unknown>): ToolCall => ({
  id: `call-${++ids}`,
  type: 'function',
  function: { name, arguments: JSON.stringify(args) },
});

function textOf(content: ModelMessage['content'] | undefined): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((b) => ('text' in b && typeof b.text === 'string' ? b.text : '')).join('');
}

function reply(params: TransportStreamParams, text: string, toolCalls: ToolCall[] = []) {
  if (text) params.callbacks?.onToken?.(text);
  params.callbacks?.onDone?.(text, {
    finishReason: toolCalls.length ? 'tool_calls' : 'stop',
    toolCalls,
    usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.001 },
  });
}

const PLAN = {
  goal: 'Fractions',
  topics: [
    { id: 'equivalent', name: 'Equivalent fractions', objectives: ['Rewrite 1/2 as 2/4'] },
    {
      id: 'adding',
      name: 'Adding fractions',
      objectives: ['Add with unlike denominators'],
      prerequisites: ['equivalent'],
    },
  ],
};

/** Intake, a plan, a quiz, then plain teaching: each move's first round, and quiet after it. */
/** The system prompt of the latest request, state block included. */
let lastSystem = '';

function tutor(params: TransportStreamParams): void {
  const messages = params.messages;
  lastSystem = messages
    .filter((m) => m.role === 'system')
    .map((m) => textOf(m.content))
    .join('\n');
  const lastUser = messages.map((m) => m.role).lastIndexOf('user');
  const said = textOf(messages[lastUser]?.content);
  const round = messages.slice(lastUser + 1).filter((m) => m.role === 'assistant').length + 1;
  if (round > 1) return reply(params, '');
  const system = textOf(messages.find((m) => m.role === 'system')?.content);
  if (said.startsWith('Answered the opening')) {
    return reply(params, 'Here is a plan.', [call('propose_plan', PLAN)]);
  }
  if (said === 'Approved the plan') {
    return reply(params, 'A quick check.', [
      call('give_quiz', {
        items: [
          { question: 'Is 2/4 equal to 1/2?', choices: ['Yes', 'No'], correct: 0 },
          {
            question: 'Which equals 3/6?',
            choices: ['1/3', '1/2', '2/3'],
            correct: 1,
            explanation: 'Divide top and bottom by 3.',
          },
        ],
      }),
    ]);
  }
  if (said.startsWith('Answered the quiz')) return reply(params, 'Good. Now try 1/3 = ?/9.');
  if (system.includes('Phase: intake')) {
    return reply(params, 'First, a question.', [
      call('ask_intake', {
        questions: [
          {
            question: 'How do fractions feel?',
            options: [{ label: 'Shaky' }, { label: 'Fine' }],
          },
          {
            question: 'What for?',
            allowMultiple: true,
            options: [{ label: 'School' }, { label: 'Work' }, { label: 'Fun' }],
          },
        ],
      }),
    ]);
  }
  return reply(params, `You said: ${said}`);
}

const pipeline = createPipelineClient({ streamChatCompletion: async (p) => tutor(p) });

/** A move in a "fresh process": the database holds nothing of the chat until the run restores it. */
async function move<T>(dir: string, act: (run: StepRun) => Promise<T>): Promise<T> {
  const saved = JSON.parse(await fs.readFile(path.join(dir, 'session.json'), 'utf8'));
  await repository.deleteChatAndMessages(saved.chat.id);
  await repository.deleteTutorEvents(saved.chat.id);
  return act(await StepRun.open(dir, { pipeline }));
}

test('a stepped chat survives being reopened between every move, and shows what the UI would', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tutor-step-'));
  await StepRun.create(
    dir,
    { tutorModel: 'provider/tutor', provider: 'openrouter', persona: 'test' },
    { pipeline },
  );

  let screen = await move(dir, (run) => run.say('I want to learn fractions'));
  assert.match(screen, /INTAKE CARD\n1\. How do fractions feel\? \(pick one\)\n {3}A\. Shaky/);
  assert.match(screen, /YOUR MOVES: intake/);

  screen = await move(dir, (run) => run.intake(['1:A', '2:A,C']));
  assert.match(screen, /PLAN PROPOSAL CARD: Fractions/);
  assert.match(screen, /2\. Adding fractions\n {3}You will: Add with unlike denominators/);

  screen = await move(dir, (run) => run.approve());
  assert.match(screen, /QUIZ CARD/);
  assert.match(screen, /LEARNING HUB: Fractions\n1\. Equivalent fractions: in progress, \d+%/);

  await assert.rejects(
    move(dir, (run) => run.answer(['A'])),
    /2 unanswered question/,
  );
  screen = await move(dir, (run) => run.answer(['A', 'C']));
  assert.match(screen, /1\. You chose A: correct\./);
  assert.match(screen, /2\. You chose C: not quite \(the answer was B\)\. Divide top and bottom/);
  assert.match(screen, /TUTOR\nGood\. Now try 1\/3 = \?\/9\./);

  screen = await move(dir, (run) => run.hub('too-high', '1'));
  assert.match(screen, /You said: Said the estimate felt too high: Equivalent fractions/);

  // Nine days away: the saved chat moves into the past, and the tutor reads the gap.
  const before = JSON.parse(await fs.readFile(path.join(dir, 'session.json'), 'utf8'));
  screen = await move(dir, (run) => run.wait(9));
  assert.match(screen, /^9 day\(s\) later/);
  assert.match(screen, /1\. Equivalent fractions: in progress, \d+%, studied 9 day\(s\) ago/);
  const after = JSON.parse(await fs.readFile(path.join(dir, 'session.json'), 'utf8'));
  assert.equal(after.events[0].at, before.events[0].at - 9 * 24 * 60 * 60 * 1000);
  assert.deepEqual(after.waits, [{ afterExchange: 5, days: 9 }]);
  screen = await move(dir, (run) => run.say('Hello again'));
  const system = lastSystem;
  assert.match(system, /Back after a break: the last exchange here was 9 days ago\./);
  assert.match(
    system,
    /- Equivalent fractions \[equivalent\]: in progress; .*last studied 9 days ago/,
  );

  const { checks } = await move(dir, (run) => run.finish());
  assert.ok(checks.length > 0);
  const transcript = JSON.parse(await fs.readFile(path.join(dir, 'transcript.json'), 'utf8'));
  assert.equal(transcript.exchanges.length, 6);
  assert.deepEqual(transcript.waits, [{ afterExchange: 5, days: 9 }]);
  assert.equal(transcript.meta.scenario, 'test');
  assert.match(transcript.promptHash, /^[0-9a-f]{12}$/);
  assert.ok(transcript.cost > 0);
  assert.match(await fs.readFile(path.join(dir, 'report.txt'), 'utf8'), /Persona test/);
});
