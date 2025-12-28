import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asNumber, asStringArray, isNonEmptyString, isRecord } from './guards';

test('isRecord identifies plain objects and rejects arrays/null', () => {
  assert.equal(isRecord({}), true);
  assert.equal(isRecord({ a: 1 }), true);
  assert.equal(isRecord(null), false);
  assert.equal(isRecord([]), false);
  assert.equal(isRecord('value'), false);
});

test('isNonEmptyString rejects empty or whitespace-only values', () => {
  assert.equal(isNonEmptyString('hello'), true);
  assert.equal(isNonEmptyString('  '), false);
  assert.equal(isNonEmptyString(''), false);
  assert.equal(isNonEmptyString(42), false);
});

test('asNumber returns finite numbers only', () => {
  assert.equal(asNumber(4), 4);
  assert.equal(asNumber(NaN), undefined);
  assert.equal(asNumber(Number.POSITIVE_INFINITY), undefined);
  assert.equal(asNumber('5'), undefined);
});

test('asStringArray filters to string entries and ignores non-arrays', () => {
  assert.deepEqual(asStringArray(['a', 1, 'b', true]), ['a', 'b']);
  assert.equal(asStringArray('not-array'), undefined);
});
