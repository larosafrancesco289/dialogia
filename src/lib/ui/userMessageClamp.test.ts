import test from 'node:test';
import assert from 'node:assert/strict';
import { USER_MESSAGE_MAX_LINES, exceedsClamp, mightNeedClamp } from './userMessageClamp';

test('a short message is never measured', () => {
  assert.equal(mightNeedClamp('Hello there.'), false);
  assert.equal(mightNeedClamp(Array(USER_MESSAGE_MAX_LINES).fill('line').join('\n')), false);
});

test('many lines, or enough text to wrap past the fold on a phone, are measured', () => {
  assert.equal(
    mightNeedClamp(
      Array(USER_MESSAGE_MAX_LINES + 1)
        .fill('x')
        .join('\n'),
    ),
    true,
  );
  assert.equal(mightNeedClamp('word '.repeat(200)), true);
});

test('a message folds only when it runs well past the fold', () => {
  const lineHeight = 22;
  assert.equal(exceedsClamp(lineHeight * USER_MESSAGE_MAX_LINES, lineHeight), false);
  // One or two lines over: folding would hide next to nothing.
  assert.equal(exceedsClamp(lineHeight * (USER_MESSAGE_MAX_LINES + 2), lineHeight), false);
  assert.equal(exceedsClamp(1391, lineHeight), true);
});

test('an unreadable line height never folds', () => {
  assert.equal(exceedsClamp(5000, Number.NaN), false);
  assert.equal(exceedsClamp(5000, 0), false);
});
