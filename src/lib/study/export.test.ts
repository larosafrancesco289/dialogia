import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStudyExportPayload } from './export';
import type { StudySession } from './types';

const createSession = (): StudySession => ({
  participantId: 'P001',
  condition: 'B',
  startedAt: 1000,
  endedAt: 2000,
  entries: [
    {
      id: '1',
      participantId: 'P001',
      condition: 'B',
      timestamp: 1001,
      action: 'session_start',
    },
    {
      id: '2',
      participantId: 'P001',
      condition: 'B',
      timestamp: 1010,
      action: 'message_sent',
    },
    {
      id: '3',
      participantId: 'P001',
      condition: 'A',
      timestamp: 1020,
      action: 'condition_changed',
    },
    {
      id: '4',
      participantId: 'P001',
      condition: 'A',
      timestamp: 1030,
      action: 'message_received',
    },
  ],
});

test('buildStudyExportPayload filters to current condition entries', () => {
  const session = createSession();
  const payload = buildStudyExportPayload(session, 'current_condition', 'A');

  assert.equal(payload.condition, 'A');
  assert.equal(payload.entries.length, 2);
  assert.ok(payload.entries.every((entry) => entry.condition === 'A'));
});

test('buildStudyExportPayload falls back to session condition', () => {
  const session = createSession();
  const payload = buildStudyExportPayload(session, 'current_condition', null);

  assert.equal(payload.condition, 'B');
  assert.equal(payload.entries.length, 2);
  assert.ok(payload.entries.every((entry) => entry.condition === 'B'));
});

test('buildStudyExportPayload keeps full session unchanged', () => {
  const session = createSession();
  const payload = buildStudyExportPayload(session, 'full_session', 'A');

  assert.equal(payload, session);
});
