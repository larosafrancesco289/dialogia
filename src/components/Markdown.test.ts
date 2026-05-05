import test from 'node:test';
import assert from 'node:assert/strict';
import { linkCitationMarkers } from './Markdown';

test('linkCitationMarkers links plain numbered source markers', () => {
  const result = linkCitationMarkers('Answer with sources [1][2].', [
    { title: 'One', url: 'https://example.com/one' },
    { title: 'Two', url: 'https://example.com/two' },
  ]);

  assert.equal(
    result,
    'Answer with sources [1](<https://example.com/one>)[2](<https://example.com/two>).',
  );
});

test('linkCitationMarkers leaves existing markdown links alone', () => {
  const result = linkCitationMarkers('Already linked [1](https://example.com).', [
    { title: 'One', url: 'https://example.org' },
  ]);

  assert.equal(result, 'Already linked [1](https://example.com).');
});
