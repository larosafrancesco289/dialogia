import { ANTHROPIC_ENDPOINT } from '@/lib/transport/endpoints';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatCompletion } from '@/lib/anthropic/chat';
import { buildTransportAuth } from '@/lib/auth/transport';

test('chatCompletion continues Anthropic pause_turn responses', async () => {
  const originalFetch = globalThis.fetch;
  const requestBodies: Array<Record<string, unknown>> = [];
  let callCount = 0;
  globalThis.fetch = async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
    callCount += 1;

    if (callCount === 1) {
      return new Response(
        JSON.stringify({
          id: 'msg_pause',
          model: 'claude-sonnet-4-6',
          stop_reason: 'pause_turn',
          content: [
            { type: 'text', text: "I'll search for that." },
            {
              type: 'server_tool_use',
              id: 'srvtool_1',
              name: 'web_search',
              input: { query: 'renewable energy latest developments' },
            },
            {
              type: 'web_search_tool_result',
              tool_use_id: 'srvtool_1',
              content: [
                {
                  type: 'web_search_result',
                  title: 'Example',
                  url: 'https://example.com',
                  encrypted_content: 'abc',
                },
              ],
            },
          ],
          usage: { input_tokens: 11, output_tokens: 17 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        id: 'msg_final',
        model: 'claude-sonnet-4-6',
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Here is the latest summary.' }],
        usage: { input_tokens: 7, output_tokens: 13 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  try {
    const response = await chatCompletion({
      auth: buildTransportAuth({ endpoint: ANTHROPIC_ENDPOINT, apiKey: 'test-key' }),
      model: 'anthropic/claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'What are the latest renewable energy developments?' }],
      plugins: [{ id: 'web' }],
    });

    assert.equal(response.choices[0]?.message.content, 'Here is the latest summary.');
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(callCount, 2);
  const secondMessages = requestBodies[1]?.messages as Array<Record<string, unknown>>;
  assert.equal(secondMessages.at(-1)?.role, 'assistant');
  assert.equal(Array.isArray(secondMessages.at(-1)?.content), true);
  assert.equal((secondMessages.at(-1)?.content as Array<unknown>).length, 3);
});
