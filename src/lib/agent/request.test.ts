import { test } from 'node:test';
import assert from 'node:assert/strict';
import { providerSortFromRoutePref, composePlugins, buildDebugBody, pdfPlugins } from './request';

test('providerSortFromRoutePref maps UI preferences to provider sort', () => {
  assert.equal(providerSortFromRoutePref('speed'), 'throughput');
  assert.equal(providerSortFromRoutePref('cost'), 'price');
  assert.equal(providerSortFromRoutePref(undefined), undefined);
  assert.equal(providerSortFromRoutePref(null as any), undefined);
});

test('pdfPlugins emits parser plugin only when PDFs are present', () => {
  assert.deepEqual(pdfPlugins(false), undefined);
  assert.deepEqual(pdfPlugins(true), [{ id: 'file-parser', pdf: { engine: 'pdf-text' } }]);
});

test('composePlugins merges pdf parser and OpenRouter web plugin', () => {
  assert.deepEqual(composePlugins({ hasPdf: false, searchEnabled: false }), undefined);
  assert.deepEqual(composePlugins({ hasPdf: true, searchEnabled: false }), [
    { id: 'file-parser', pdf: { engine: 'pdf-text' } },
  ]);
  assert.deepEqual(
    composePlugins({ hasPdf: false, searchEnabled: true, searchProvider: 'openrouter' }),
    [{ id: 'web' }],
  );
  assert.deepEqual(
    composePlugins({ hasPdf: true, searchEnabled: true, searchProvider: 'openrouter' }),
    [{ id: 'file-parser', pdf: { engine: 'pdf-text' } }, { id: 'web' }],
  );
});

test('buildDebugBody includes optional knobs when provided', () => {
  const body = buildDebugBody({
    modelId: 'provider/model',
    messages: [{ role: 'user', content: 'hi' }],
    stream: true,
    includeUsage: true,
    temperature: 0.5,
    top_p: 0.9,
    max_tokens: 256,
    reasoningEffort: 'medium',
    reasoningTokens: 1024,
    tools: [
      {
        type: 'function',
        function: {
          name: 'tutor_call',
          parameters: { type: 'object', properties: {} },
        },
      },
    ],
    toolChoice: 'auto',
    providerSort: 'price',
    plugins: [{ id: 'web' }],
    canImageOut: true,
  });

  assert.equal(body.model, 'provider/model');
  assert.equal(body.stream, true);
  assert.deepEqual(body.stream_options, { include_usage: true });
  assert.deepEqual(body.modalities, ['image', 'text']);
  assert.equal(body.temperature, 0.5);
  assert.equal(body.top_p, 0.9);
  assert.equal(body.max_tokens, 256);
  assert.deepEqual(body.reasoning, { effort: 'medium', max_tokens: 1024 });
  assert.equal(body.tools?.[0]?.function?.name, 'tutor_call');
  assert.equal(body.tool_choice, 'auto');
  assert.deepEqual(body.provider, { sort: 'price' });
  assert.deepEqual(body.plugins, [{ id: 'web' }]);
});
