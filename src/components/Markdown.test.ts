import test from 'node:test';
import assert from 'node:assert/strict';
import { linkCitationMarkers } from '@/lib/markdown/citations';

const TWO_SOURCES = [
  { title: 'One', url: 'https://example.com/one' },
  { title: 'Two', url: 'https://example.com/two' },
];

test('linkCitationMarkers links markers side by side with a comma between, so [1][2] never reads as 12', () => {
  const linked = 'sources [1](<https://example.com/one>), [2](<https://example.com/two>).';
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
    'Apart [1](<https://example.com/one>) and [2](<https://example.com/two>).',
  );
});

test('linkCitationMarkers keeps a marker with no source as written', () => {
  assert.equal(
    linkCitationMarkers('Seen [2][7].', TWO_SOURCES),
    'Seen [2](<https://example.com/two>), [7].',
  );
  assert.equal(linkCitationMarkers('Seen [7][9].', TWO_SOURCES), 'Seen [7][9].');
  assert.equal(linkCitationMarkers('The interval [1, 2].', TWO_SOURCES), 'The interval [1, 2].');
});

test('linkCitationMarkers links a marker just before a markdown link, not the link', () => {
  assert.equal(
    linkCitationMarkers('See [1][2](https://x.test).', TWO_SOURCES),
    'See [1](<https://example.com/one>)[2](https://x.test).',
  );
});

test('linkCitationMarkers leaves existing markdown links alone', () => {
  const result = linkCitationMarkers('Already linked [1](https://example.com).', [
    { title: 'One', url: 'https://example.org' },
  ]);

  assert.equal(result, 'Already linked [1](https://example.com).');
});
