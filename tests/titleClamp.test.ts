import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fallbackChatTitle } from '@/lib/services/titleGenerator';

test('a title cut with no word boundary never ends in half an emoji', () => {
  // 59 letters, then an emoji whose surrogate pair straddles the 60-character cut.
  const title = fallbackChatTitle(`${'a'.repeat(59)}😀${'b'.repeat(20)}`);
  assert.ok(title);
  assert.doesNotMatch(title, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  assert.equal(title, `A${'a'.repeat(58)}…`);
});
