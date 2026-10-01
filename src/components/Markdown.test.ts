import test from 'node:test';
import assert from 'node:assert/strict';
import { linkCitationMarkers } from '@/lib/markdown/citations';

const TWO_SOURCES = [
  { title: 'One', url: 'https://example.com/one' },
  { title: 'Two', url: 'https://example.com/two' },
];

test('linkCitationMarkers links markers side by side with a comma between, so [1][2] never reads as 12', () => {
  const linked =
    'sources [1](<https://example.com/one> "Source 1: One"), [2](<https://example.com/two> "Source 2: Two").';
  assert.equal(
    linkCitationMarkers('Answer with sources [1][2].', TWO_SOURCES),
    `Answer with ${linked}`,
  );
  assert.equal(
    linkCitationMarkers('Answer with sources [1] [2].', TWO_SOURCES),
    `Answer with ${linked}`,
  );
  assert.equal(
    linkCitationMarkers('Apart [1] and [2].', TWO_SOURCES),
    'Apart [1](<https://example.com/one> "Source 1: One") and [2](<https://example.com/two> "Source 2: Two").',
  );
});

test('linkCitationMarkers keeps a marker with no source as written', () => {
  assert.equal(
    linkCitationMarkers('Seen [2][7].', TWO_SOURCES),
    'Seen [2](<https://example.com/two> "Source 2: Two"), [7].',
  );
  assert.equal(linkCitationMarkers('Seen [7][9].', TWO_SOURCES), 'Seen [7][9].');
  assert.equal(linkCitationMarkers('The interval [1, 2].', TWO_SOURCES), 'The interval [1, 2].');
});

test('linkCitationMarkers links a marker just before a markdown link, not the link', () => {
  assert.equal(
    linkCitationMarkers('See [1][2](https://x.test).', TWO_SOURCES),
    'See [1](<https://example.com/one> "Source 1: One")[2](https://x.test).',
  );
});

test('a citation is titled with its source, whose own quotes and breaks stay text', () => {
  assert.equal(
    linkCitationMarkers('Yes [1].', [{ title: 'A "quoted"\n\\ title', url: 'https://a.test' }]),
    'Yes [1](<https://a.test> "Source 1: A \\"quoted\\" \\\\ title").',
  );
  assert.equal(
    linkCitationMarkers('Yes [1].', [{ url: 'https://www.b.test/page' }]),
    'Yes [1](<https://www.b.test/page> "Source 1: b.test").',
  );
});

test('linkCitationMarkers leaves existing markdown links alone', () => {
  const result = linkCitationMarkers('Already linked [1](https://example.com).', [
    { title: 'One', url: 'https://example.org' },
  ]);

  assert.equal(result, 'Already linked [1](https://example.com).');
});
