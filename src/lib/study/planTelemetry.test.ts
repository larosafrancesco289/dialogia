import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyPlanInspectionDepth, shouldLogPlanInspection } from './planTelemetry';

test('classifyPlanInspectionDepth returns scan for short dwell and no interactions', () => {
  const depth = classifyPlanInspectionDepth({ dwellMs: 2500, interactionCount: 0 });
  assert.equal(depth, 'scan');
});

test('classifyPlanInspectionDepth returns inspect at dwell threshold', () => {
  const depth = classifyPlanInspectionDepth({ dwellMs: 3000, interactionCount: 0 });
  assert.equal(depth, 'inspect');
});

test('classifyPlanInspectionDepth returns inspect at one interaction', () => {
  const depth = classifyPlanInspectionDepth({ dwellMs: 1200, interactionCount: 1 });
  assert.equal(depth, 'inspect');
});

test('classifyPlanInspectionDepth returns deep at dwell threshold', () => {
  const depth = classifyPlanInspectionDepth({ dwellMs: 8000, interactionCount: 0 });
  assert.equal(depth, 'deep');
});

test('classifyPlanInspectionDepth returns deep at interaction threshold', () => {
  const depth = classifyPlanInspectionDepth({ dwellMs: 1200, interactionCount: 2 });
  assert.equal(depth, 'deep');
});

test('shouldLogPlanInspection requires dwell or interaction threshold', () => {
  assert.equal(shouldLogPlanInspection({ dwellMs: 2999, interactionCount: 0 }), false);
  assert.equal(shouldLogPlanInspection({ dwellMs: 3000, interactionCount: 0 }), true);
  assert.equal(shouldLogPlanInspection({ dwellMs: 1000, interactionCount: 1 }), true);
});
