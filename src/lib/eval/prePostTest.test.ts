import { test } from 'node:test';
import assert from 'node:assert/strict';

import { calculateCohenD, welchTTest, twoWayAnova } from './prePostTest';

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

// ============================================================================
// Welch's t-test
// ============================================================================

test('welchTTest returns non-significant for identical groups', () => {
  const result = welchTTest([1, 2, 3, 4, 5], [1, 2, 3, 4, 5]);
  assert.equal(result.t, 0);
  assert.equal(result.significant, false);
  assert.ok(result.p > 0.99, `p-value should be ~1 for identical groups, got ${result.p}`);
});

test('welchTTest returns insufficient data for small groups', () => {
  const result = welchTTest([1], [2, 3]);
  assert.equal(result.t, 0);
  assert.equal(result.p, 1);
  assert.equal(result.significant, false);
});

test('welchTTest detects significant difference for clearly different groups', () => {
  // Group1 mean ~2, Group2 mean ~8
  const group1 = [1, 2, 3, 2, 2];
  const group2 = [7, 8, 9, 8, 8];
  const result = welchTTest(group1, group2);

  assert.ok(result.t < -10, `t-statistic should be strongly negative, got ${result.t}`);
  assert.ok(result.p < 0.001, `p-value should be very small, got ${result.p}`);
  assert.equal(result.significant, true);
});

test('welchTTest approximates known values', () => {
  // Example: comparing two samples with known statistical properties
  // Group 1: [2, 4, 6, 8] mean=5, var=6.67
  // Group 2: [1, 2, 3, 4] mean=2.5, var=1.67
  const result = welchTTest([2, 4, 6, 8], [1, 2, 3, 4]);

  // t = (5 - 2.5) / sqrt(6.67/4 + 1.67/4) = 2.5 / sqrt(2.085) ≈ 1.73
  assert.ok(Math.abs(result.t - 1.73) < 0.1, `t ≈ 1.73, got ${result.t}`);
  assert.ok(result.df > 3 && result.df < 7, `df should be between 3 and 7, got ${result.df}`);
});

// ============================================================================
// 2-Way ANOVA
// ============================================================================

test('twoWayAnova returns zeros for insufficient data', () => {
  const result = twoWayAnova({
    fullSystem: [1],
    planOnly: [2],
    modelOnly: [3],
    baseline: [4],
  });
  assert.equal(result.planEffect.f, 0);
  assert.equal(result.modelEffect.f, 0);
  assert.equal(result.interaction.f, 0);
});

test('twoWayAnova detects main effect of plan', () => {
  // Plan visible (fullSystem, planOnly) has higher values than plan hidden (modelOnly, baseline)
  const result = twoWayAnova({
    fullSystem: [8, 9, 8, 9, 8],
    planOnly: [8, 9, 8, 9, 8],
    modelOnly: [2, 3, 2, 3, 2],
    baseline: [2, 3, 2, 3, 2],
  });

  assert.ok(result.planEffect.f > 100, `F for plan should be large, got ${result.planEffect.f}`);
  assert.ok(result.planEffect.p < 0.001, `p for plan should be very small, got ${result.planEffect.p}`);
  assert.equal(result.planEffect.significant, true);
  // Model effect should be near zero since plan-visible and plan-hidden have same model patterns
  assert.ok(result.modelEffect.f < 1, `F for model should be small, got ${result.modelEffect.f}`);
});

test('twoWayAnova detects main effect of model', () => {
  // Model visible (fullSystem, modelOnly) has higher values than model hidden (planOnly, baseline)
  const result = twoWayAnova({
    fullSystem: [8, 9, 8, 9, 8],
    planOnly: [2, 3, 2, 3, 2],
    modelOnly: [8, 9, 8, 9, 8],
    baseline: [2, 3, 2, 3, 2],
  });

  assert.ok(result.modelEffect.f > 100, `F for model should be large, got ${result.modelEffect.f}`);
  assert.ok(result.modelEffect.p < 0.001, `p for model should be very small, got ${result.modelEffect.p}`);
  assert.equal(result.modelEffect.significant, true);
  // Plan effect should be near zero
  assert.ok(result.planEffect.f < 1, `F for plan should be small, got ${result.planEffect.f}`);
});

test('twoWayAnova detects interaction effect', () => {
  // Interaction: fullSystem is much higher than what would be expected from additive effects
  // fullSystem has mean ~10, others have mean ~2
  // Need some within-group variance for F-statistic to be computable
  const result = twoWayAnova({
    fullSystem: [9, 10, 11, 10, 10],
    planOnly: [1, 2, 3, 2, 2],
    modelOnly: [1, 2, 3, 2, 2],
    baseline: [1, 2, 3, 2, 2],
  });

  assert.ok(result.interaction.f > 10, `F for interaction should be substantial, got ${result.interaction.f}`);
  assert.equal(result.interaction.significant, true);
});

test('twoWayAnova returns non-significant for no effects', () => {
  // All groups have same distribution
  const result = twoWayAnova({
    fullSystem: [5, 5, 5, 5, 5],
    planOnly: [5, 5, 5, 5, 5],
    modelOnly: [5, 5, 5, 5, 5],
    baseline: [5, 5, 5, 5, 5],
  });

  // All F-statistics should be 0 or very small (due to no variance)
  assert.ok(result.planEffect.f === 0 || result.planEffect.p > 0.5);
  assert.ok(result.modelEffect.f === 0 || result.modelEffect.p > 0.5);
  assert.ok(result.interaction.f === 0 || result.interaction.p > 0.5);
});
