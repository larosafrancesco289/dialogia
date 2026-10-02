import test from 'node:test';
import assert from 'node:assert/strict';
import { citeSourceLinks, linkCitationMarkers, withoutTracking } from '@/lib/markdown/citations';

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

test("a provider's own citation, a parenthesised link to a source, becomes that source's marker", () => {
  const sources = [
    { title: 'Python', url: 'https://www.python.org/downloads/' },
    { title: 'PEP', url: 'https://peps.python.org/pep-0745/' },
  ];
  assert.equal(
    citeSourceLinks(
      'Python 3.14.8 is out. ([python.org](https://www.python.org/downloads/?utm_source=openai))',
      sources,
    ),
    'Python 3.14.8 is out. [1]',
  );
  assert.equal(
    citeSourceLinks(
      'Two ([a](https://peps.python.org/pep-0745/), [b](https://www.python.org/downloads/)).',
      sources,
    ),
    'Two [2][1].',
  );
  // A link to anything that is not a source stays a link.
  const other = 'See ([docs](https://docs.python.org/)) here.';
  assert.equal(citeSourceLinks(other, sources), other);
});

test('tracking parameters come off a source link, and nothing else does', () => {
  assert.equal(
    withoutTracking('https://a.test/page?id=3&utm_source=openai&utm_medium=x'),
    'https://a.test/page?id=3',
  );
  assert.equal(withoutTracking('https://a.test/page?utm_source=openai'), 'https://a.test/page');
  assert.equal(withoutTracking('https://a.test'), 'https://a.test');
  assert.equal(withoutTracking('not a url'), 'not a url');
});
