import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMessageSources, sourcesFromAnnotations } from '@/lib/ui/messageSources';
import { buildOrderedResponseActivity, summarizeActivity } from '@/lib/ui/responseActivity';
import { linkCitationMarkers } from '@/lib/markdown/citations';

// What OpenRouter stores on a reply after provider-native web search.
const nativeAnnotations = [
  {
    type: 'url_citation',
    url_citation: {
      url: 'https://example.com/a',
      title: 'Page A',
      content: 'Excerpt from A',
      start_index: 10,
      end_index: 40,
    },
  },
  {
    type: 'url_citation',
    url_citation: { url: 'https://example.org/b', title: 'Page B', start_index: 50, end_index: 90 },
  },
  {
    type: 'url_citation',
    url_citation: { url: 'https://example.com/a', start_index: 100, end_index: 120 },
  },
];

test('url_citation annotations become sources, once per URL, in citation order', () => {
  assert.deepEqual(sourcesFromAnnotations(nativeAnnotations), [
    { url: 'https://example.com/a', title: 'Page A', description: 'Excerpt from A' },
    { url: 'https://example.org/b', title: 'Page B' },
  ]);
});

test('a repeat citation fills in what the first one lacked', () => {
  assert.deepEqual(
    sourcesFromAnnotations([
      { type: 'url_citation', url_citation: { url: 'https://x.test/' } },
      { type: 'url_citation', url_citation: { url: 'https://x.test/', title: 'X', content: 'c' } },
    ]),
    [{ url: 'https://x.test/', title: 'X', description: 'c' }],
  );
});

test('flat and nested shapes still count; non-web annotations do not', () => {
  assert.deepEqual(
    sourcesFromAnnotations({
      citations: [{ url: 'https://flat.test', title: 'Flat', description: 'd' }],
    }),
    [{ url: 'https://flat.test', title: 'Flat', description: 'd' }],
  );
  // OpenRouter's parsed-PDF annotation carries no page to cite.
  assert.deepEqual(
    sourcesFromAnnotations([{ type: 'file', file: { hash: 'h', name: 'a.pdf', content: [] } }]),
    [],
  );
  assert.deepEqual(sourcesFromAnnotations(undefined), []);
  assert.deepEqual(sourcesFromAnnotations('nope'), []);
});

test('native citations resolve to a finished search the ledger reports as consulted sources', () => {
  const sources = resolveMessageSources({ annotations: nativeAnnotations });
  assert.equal(sources?.status, 'done');
  assert.equal(sources?.results?.length, 2);

  // The ledger folds the sources in as a search step with its result count.
  const ordered = buildOrderedResponseActivity({ reasoning: '', sources });
  const search = ordered.find((item) => item.type === 'tool_call');
  assert.equal(search?.type === 'tool_call' ? search.name : undefined, 'web_search');
  assert.equal(
    summarizeActivity({
      orderedActivity: ordered,
      toolCalls: [],
      reasoning: '',
      sources,
      isLive: false,
    }),
    '1 search',
  );

  // And the reply's [n] markers link to the same numbered list.
  assert.equal(
    linkCitationMarkers('See [2] and [1].', sources?.results),
    'See [2](<https://example.org/b>) and [1](<https://example.com/a>).',
  );
});

test("a tool-based search's own entry wins over annotations", () => {
  const entry = {
    query: 'q',
    status: 'loading' as const,
    results: [{ url: 'https://tool.test', title: 'Tool' }],
  };
  assert.equal(
    resolveMessageSources({ searchEntry: entry, annotations: nativeAnnotations }),
    entry,
  );
});

test('no search, no sources', () => {
  assert.equal(resolveMessageSources({ annotations: [] }), undefined);
  assert.equal(resolveMessageSources({}), undefined);
});
