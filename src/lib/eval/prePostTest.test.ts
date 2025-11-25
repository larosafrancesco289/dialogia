import { test } from 'node:test';
import assert from 'node:assert/strict';

import { calculateCohenD } from './prePostTest';

test('calculateCohenD returns insufficient-data when either group is too small', () => {
  const emptyGroup = calculateCohenD([], [1, 2, 3]);
  assert.equal(emptyGroup.d, 0);
  assert.equal(emptyGroup.interpretation, 'insufficient-data');

  const singleSample = calculateCohenD([1], [2, 3]);
  assert.equal(singleSample.d, 0);
  assert.equal(singleSample.interpretation, 'insufficient-data');
});

test('calculateCohenD computes effect size for valid groups', () => {
  const result = calculateCohenD([1, 2, 3], [1, 2, 4, 5]);
  assert.ok(Math.abs(result.d - -0.6455) < 0.0005);
  assert.equal(result.interpretation, 'medium');
});
