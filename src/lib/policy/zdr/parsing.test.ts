import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseZdrEndpoints } from './parsing';

test('parseZdrEndpoints normalizes provider, url, and model ids', () => {
  const payload = {
    data: [
      {
        provider: 'moonshotai',
        models: ['moonshotai/moon-1', { id: 'mistralai/mixtral-8x7b' }],
        url: 'https://api.moonshot.example',
        name: 'ZDR | moonshotai/moon-1',
      },
      {
        provider_id: 'openai',
        id: 'openai/endpoint',
        models: [{ id: 'openai/gpt-4o' }],
        endpoint: 'https://api.openai.com',
      },
    ],
  };

  const endpoints = parseZdrEndpoints(payload);
  assert.equal(endpoints.length, 2);
  assert.equal(endpoints[0]?.providerId, 'moonshotai');
  assert.deepEqual(endpoints[0]?.models, ['moonshotai/moon-1', 'mistralai/mixtral-8x7b']);
  assert.equal(endpoints[0]?.url, 'https://api.moonshot.example');
  assert.equal(endpoints[0]?.name, 'ZDR | moonshotai/moon-1');

  assert.equal(endpoints[1]?.providerId, 'openai');
  assert.equal(endpoints[1]?.id, 'openai/endpoint');
  assert.deepEqual(endpoints[1]?.models, ['openai/gpt-4o']);
  assert.equal(endpoints[1]?.url, 'https://api.openai.com');
});

test('parseZdrEndpoints returns empty list for invalid payloads', () => {
  assert.deepEqual(parseZdrEndpoints(null), []);
  assert.deepEqual(parseZdrEndpoints({}), []);
  assert.deepEqual(parseZdrEndpoints({ data: null }), []);
});
