import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStudyExportPayload, buildStudySummary } from './export';
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
      action: 'plan_node_closed',
      metadata: {
        nodeId: 'n1',
        nodeName: 'Node 1',
        section: 'up_next',
        dwellMs: 2200,
        interactionCount: 0,
        depth: 'scan',
      },
    },
    {
      id: '3',
      participantId: 'P001',
      condition: 'A',
      timestamp: 1020,
      action: 'condition_changed',
      metadata: {
        from: 'B',
        to: 'A',
      },
    },
    {
      id: '4',
      participantId: 'P001',
      condition: 'A',
      timestamp: 1030,
      action: 'plan_node_inspected',
      metadata: {
        nodeId: 'n2',
        nodeName: 'Node 2',
        section: 'in_progress',
        dwellMs: 9000,
        interactionCount: 2,
        depth: 'deep',
      },
    },
  ],
});

test('buildStudyExportPayload filters to current condition entries', () => {
  const session = createSession();
  const payload = buildStudyExportPayload(session, 'current_condition', 'A');

  assert.equal(payload.schemaVersion, 2);
  assert.equal(payload.session.condition, 'A');
  assert.equal(payload.session.entries.length, 2);
  assert.ok(payload.session.entries.every((entry) => entry.condition === 'A'));
  assert.equal(payload.summary.totalEntries, 2);
});

test('buildStudyExportPayload falls back to session condition', () => {
  const session = createSession();
  const payload = buildStudyExportPayload(session, 'current_condition', null);

  assert.equal(payload.session.condition, 'B');
  assert.equal(payload.session.entries.length, 2);
  assert.ok(payload.session.entries.every((entry) => entry.condition === 'B'));
});

test('buildStudyExportPayload keeps full session entries', () => {
  const session = createSession();
  const payload = buildStudyExportPayload(session, 'full_session', 'A');

  assert.equal(payload.schemaVersion, 2);
  assert.equal(payload.session.entries.length, session.entries.length);
  assert.equal(payload.summary.totalEntries, session.entries.length);
});

test('buildStudySummary computes action counts and investigation metrics', () => {
  const session = createSession();
  const summary = buildStudySummary(session, { recentLimit: 2 });

  assert.equal(summary.entriesByAction.session_start, 1);
  assert.equal(summary.entriesByAction.plan_node_closed, 1);
  assert.equal(summary.entriesByAction.plan_node_inspected, 1);
  assert.equal(summary.investigation.inspectedNodeCount, 1);
  assert.equal(summary.investigation.deepNodeCount, 1);
  assert.equal(summary.investigation.averageDwellMs, 9000);
  assert.equal(summary.investigation.totalNodeInteractions, 2);
  assert.equal(summary.recentEvents.length, 2);
});
