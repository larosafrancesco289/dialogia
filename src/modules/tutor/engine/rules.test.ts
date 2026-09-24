import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MASTERY_PRIOR,
  MORE_PRACTICE_CAP,
  READY,
  applyEvidence,
  clampWeight,
  contestTarget,
  diagnosticWeight,
  markKnownTarget,
  masteryBand,
  morePracticeTarget,
  quizWeight,
} from '@/modules/tutor/engine';

test('the numbers the spec fixes', () => {
  assert.equal(MASTERY_PRIOR, 0.3);
  assert.equal(READY, 0.8);
  assert.equal(MORE_PRACTICE_CAP, 0.6);
  assert.equal(quizWeight(true), 0.4);
  assert.equal(quizWeight(false), -0.3);
  assert.equal(diagnosticWeight(true), 0.3);
  assert.equal(diagnosticWeight(false), -0.2);
});

test('eq. 1: positive weight closes a share of the gap, negative removes a share', () => {
  assert.equal(applyEvidence(0.3, { weight: 0.4 }), 0.3 + 0.4 * 0.7);
  assert.equal(applyEvidence(0.5, { weight: -0.3 }), 0.5 - 0.3 * 0.5);
  assert.equal(applyEvidence(0.42, { weight: 0 }), 0.42);
  assert.equal(applyEvidence(0.42, {}), 0.42);
});

test('weights are clamped to [-0.5, 0.7]', () => {
  assert.equal(clampWeight(2), 0.7);
  assert.equal(clampWeight(-3), -0.5);
  assert.equal(applyEvidence(0, { weight: 5 }), 0.7);
  assert.equal(applyEvidence(1, { weight: -5 }), 0.5);
});

test('setTo overrides the weight and is clamped to [0, 1]', () => {
  assert.equal(applyEvidence(0.9, { weight: 0.7, setTo: 0.2 }), 0.2);
  assert.equal(applyEvidence(0.5, { setTo: 1.4 }), 1);
  assert.equal(applyEvidence(0.5, { setTo: -1 }), 0);
});

test('mark known is a floor and more practice is a cap', () => {
  assert.equal(markKnownTarget(0.3), READY);
  assert.equal(markKnownTarget(0.95), 0.95);
  assert.equal(morePracticeTarget(0.9), MORE_PRACTICE_CAP);
  assert.equal(morePracticeTarget(0.4), 0.4);
});

test('bands: building below 50%, practising to 80%, ready from 80%', () => {
  assert.equal(masteryBand(0.49), 'building');
  assert.equal(masteryBand(0.5), 'practising');
  assert.equal(masteryBand(0.79), 'practising');
  assert.equal(masteryBand(0.8), 'ready');
});

test('"Too high" and "Too low" move one step, to the whole percent, within 0 to 1', () => {
  assert.equal(contestTarget(0.5, 'up'), 0.65);
  assert.equal(contestTarget(0.5, 'down'), 0.35);
  assert.equal(contestTarget(0.583, 'down'), 0.43);
  assert.equal(contestTarget(0.95, 'up'), 1);
  assert.equal(contestTarget(0.1, 'down'), 0);
});
