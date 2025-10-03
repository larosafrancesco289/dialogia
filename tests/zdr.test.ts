import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateZdrModel } from '@/lib/zdr';

test('evaluateZdrModel allows models in explicit list', () => {
  const result = evaluateZdrModel('provider/model-a', {
    modelIds: new Set(['provider/model-a']),
    providerIds: new Set<string>(),
  });
  assert.equal(result.status, 'allowed');
});

test('evaluateZdrModel allows providers when models list empty', () => {
  const result = evaluateZdrModel('other/model-x', {
    modelIds: new Set<string>(),
    providerIds: new Set(['other']),
  });
  assert.equal(result.status, 'allowed');
});

test('evaluateZdrModel forbids when not in lists', () => {
  const result = evaluateZdrModel('unknown/model', {
    modelIds: new Set(['provider/model-a']),
    providerIds: new Set(['provider']),
  });
  assert.deepEqual(result, { status: 'forbidden', reason: 'model' });
});
