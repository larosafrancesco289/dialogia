import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Chat, LearningPlanNode, TopicMastery } from '@/lib/types';
import { emptyTutorState, type TutorState } from '@/modules/tutor/engine/state';
import { learningRecord, tutorLearningRecords } from '@/modules/tutor/lib/learningRecords';

const chat = { id: 'c1', title: 'Bayes', updatedAt: 42 } as Chat;

const node = (
  id: string,
  status: LearningPlanNode['status'],
  prerequisites: string[] = [],
): LearningPlanNode => ({ id, name: id.toUpperCase(), objectives: [], prerequisites, status });

const mastery = (nodeId: string, confidence: number, measured = true): TopicMastery => ({
  nodeId,
  confidence,
  interactions: measured ? 1 : 0,
  lastInteraction: 0,
  evidence: [],
  misconceptions: [],
});

test('a tutor chat without an approved plan has no record yet', () => {
  assert.equal(learningRecord(chat, emptyTutorState()), undefined);
});

test('a record shows the whole path, with numbers only where there is evidence', () => {
  const state = emptyTutorState();
  state.plan = {
    goal: 'Read a test result',
    generatedAt: 0,
    updatedAt: 0,
    version: 1,
    nodes: [
      node('a', 'completed'),
      node('b', 'in_progress', ['a']),
      node('c', 'not_started', ['b']),
      node('d', 'not_started', ['a']),
      node('e', 'not_started', ['b']),
    ],
  };
  state.mastery = {
    a: mastery('a', 0.84),
    b: mastery('b', 0.615),
    c: mastery('c', 0.3),
    d: mastery('d', 0.3, false),
    e: mastery('e', 0.3, false),
  };

  const record = learningRecord(chat, state);
  assert.ok(record);
  assert.equal(record.chatId, 'c1');
  assert.equal(record.goal, 'Read a test result');
  assert.equal(record.studiedAt, 42);
  assert.equal(record.finished, false);
  assert.deepEqual(record.topics, [
    { name: 'A', state: 'done', percent: 84, status: 'Done' },
    { name: 'B', state: 'current', percent: 62, status: 'In progress' },
    // Locked: its number would say more than the tutor knows.
    // The topic just before goes without saying; one further back is named.
    { name: 'C', state: 'locked', status: 'Not started' },
    { name: 'D', state: 'ready', status: 'Up next' },
    { name: 'E', state: 'locked', status: 'Starts after “B”' },
  ]);
});

test('a started topic shows its starting number before any evidence', () => {
  const state = emptyTutorState();
  state.plan = {
    goal: 'Read a test result',
    generatedAt: 0,
    updatedAt: 0,
    version: 1,
    nodes: [node('a', 'in_progress'), node('b', 'not_started')],
  };
  state.mastery = { a: mastery('a', 0.3, false), b: mastery('b', 0.3, false) };
  assert.deepEqual(
    learningRecord(chat, state)?.topics.map((t) => t.percent),
    [30, undefined],
  );
});

test('a record carries its plan’s subject, and only tutor chats with a plan and memory have one', async () => {
  const planned = emptyTutorState();
  planned.plan = {
    goal: 'Read a test result',
    subject: 'Probability',
    generatedAt: 0,
    updatedAt: 0,
    version: 1,
    nodes: [node('a', 'in_progress')],
  };
  planned.mastery = { a: mastery('a', 0.4) };
  const tutorChat = (id: string) =>
    ({ id, updatedAt: 1, settings: { features: { tutor: { enabled: true } } } }) as Chat;
  const states: Record<string, TutorState> = { t1: planned, t2: emptyTutorState() };
  const loaded: string[] = [];
  // Memory switched off in its composer keeps a chat out of memory, plan or not.
  const keptOut = {
    id: 'private',
    updatedAt: 1,
    settings: { features: { tutor: { enabled: true }, memory: { enabled: false } } },
  } as Chat;

  const records = await tutorLearningRecords(
    [
      tutorChat('t1'),
      tutorChat('t2'),
      { id: 'plain', settings: { features: {} } } as Chat,
      keptOut,
    ],
    async (chatId) => {
      loaded.push(chatId);
      return { events: [], state: states[chatId], loaded: true };
    },
  );
  assert.deepEqual(loaded, ['t1', 't2']);
  assert.deepEqual(
    records.map((record) => [record.chatId, record.subject]),
    [['t1', 'Probability']],
  );
});

test('a chat with no subject takes the subject of a later chat that carried a topic from it', async () => {
  const older = emptyTutorState();
  older.plan = {
    goal: 'Positive results',
    generatedAt: 0,
    updatedAt: 0,
    version: 1,
    nodes: [node('a', 'in_progress')],
  };
  older.mastery = { a: mastery('a', 0.5) };
  const newer = emptyTutorState();
  newer.plan = { ...older.plan, goal: 'False positives', subject: 'Screening tests' };
  newer.mastery = {
    a: {
      ...mastery('a', 0.5),
      evidence: [
        {
          timestamp: 0,
          type: 'placement',
          details: '',
          weight: 1,
          carriedOver: { chatId: 'old', topic: 'A', estimate: 0.5, studiedAt: 0 },
        } as TopicMastery['evidence'][number],
      ],
    },
  };
  const tutorChat = (id: string) =>
    ({ id, updatedAt: 1, settings: { features: { tutor: { enabled: true } } } }) as Chat;
  const states: Record<string, TutorState> = { old: older, new: newer };
  const records = await tutorLearningRecords([tutorChat('new'), tutorChat('old')], async (id) => ({
    events: [],
    state: states[id],
    loaded: true,
  }));
  assert.deepEqual(
    records.map((record) => [record.chatId, record.subject]),
    [
      ['new', 'Screening tests'],
      ['old', 'Screening tests'],
    ],
  );
});
