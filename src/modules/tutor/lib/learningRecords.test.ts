import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Chat, LearningPlanNode, TopicMastery } from '@/lib/types';
import { emptyTutorState } from '@/modules/tutor/engine/state';
import { learningRecord } from '@/modules/tutor/lib/learningRecords';

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
    ],
  };
  state.mastery = {
    a: mastery('a', 0.84),
    b: mastery('b', 0.615),
    c: mastery('c', 0.3),
    d: mastery('d', 0.3, false),
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
    { name: 'C', state: 'locked', status: 'Starts after B' },
    { name: 'D', state: 'ready', status: 'Up next' },
  ]);
});
