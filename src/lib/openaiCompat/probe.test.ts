import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectedCapabilities,
  parseSseChunks,
  probeEndpoint,
  type ProbeStep,
  type ProbeTransport,
} from '@/lib/openaiCompat/probe';
import type { OpenRouterChatRequest } from '@/lib/openrouter/types';
import { endpointCapabilities, type ProviderEndpoint } from '@/lib/transport/endpoints';

const endpoint: ProviderEndpoint = {
  id: 'ollama',
  kind: 'openai-compatible',
  label: 'Ollama',
  baseUrl: 'http://localhost:11434/v1',
  modelIds: ['qwen3:8b'],
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const sse = (chunks: unknown[]) =>
  new Response(
    [...chunks.map((chunk) => `data: ${JSON.stringify(chunk)}`), 'data: [DONE]', ''].join('\n\n'),
    {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    },
  );

const streamChunk = { choices: [{ index: 0, delta: { content: 'ok' } }] };

function transportWith(
  chat: (body: OpenRouterChatRequest) => Response | Promise<Response>,
  models: () => Response | Promise<Response> = () => json({ data: [{ id: 'qwen3:8b' }] }),
): ProbeTransport {
  return {
    models: async () => models(),
    chat: async (_auth, body) => chat(body),
  };
}

test('an unreachable server stops the probe at the first step', async () => {
  const steps: ProbeStep[] = [];
  const result = await probeEndpoint(
    { endpoint },
    {
      onStep: (step) => steps.push(step),
      transport: transportWith(
        () => {
          throw new Error('chat should not be attempted');
        },
        () => {
          throw new TypeError('Failed to fetch');
        },
      ),
    },
  );
  assert.equal(result.models.verdict, 'unreachable');
  assert.equal(result.chat.verdict, 'skipped');
  assert.equal(result.capabilities.tools.verdict, 'skipped');
  assert.deepEqual(steps, ['models']);
});

test('a missing /models route is not a failure, and the typed id is still tried', async () => {
  const seen: string[] = [];
  const result = await probeEndpoint(
    { endpoint },
    {
      transport: transportWith(
        (body) => {
          seen.push(body.model);
          return body.stream ? sse([streamChunk]) : json({ choices: [] });
        },
        () => new Response('not found', { status: 404 }),
      ),
    },
  );
  assert.equal(result.models.verdict, 'no-route');
  assert.equal(result.modelId, 'qwen3:8b');
  assert.equal(result.chat.verdict, 'ok');
  assert.ok(seen.every((model) => model === 'qwen3:8b'));
});

test('each capability is judged by the one field it gates', async () => {
  const steps: ProbeStep[] = [];
  const result = await probeEndpoint(
    { endpoint },
    {
      onStep: (step) => steps.push(step),
      transport: transportWith((body) => {
        if (body.reasoning) return json({ error: { message: 'unknown field: reasoning' } }, 400);
        if (body.parallel_tool_calls !== undefined) return json({ choices: [] });
        if (body.tools) return json({ choices: [] });
        if (body.stream_options) return sse([streamChunk]);
        if (body.stream) return sse([streamChunk]);
        const content = body.messages[0]?.content;
        if (Array.isArray(content) && content.some((block) => block.type === 'image_url')) {
          return json({ error: { message: 'images are not supported' } }, 400);
        }
        return json({ choices: [] });
      }),
    },
  );

  assert.equal(result.chat.verdict, 'ok');
  assert.equal(result.capabilities.tools.verdict, 'ok');
  assert.equal(result.capabilities.parallelToolCalls.verdict, 'ok');
  assert.equal(result.capabilities.reasoning.verdict, 'no');
  assert.match(result.capabilities.reasoning.detail ?? '', /unknown field: reasoning/);
  assert.equal(result.capabilities.vision.verdict, 'no');
  // Accepting `stream_options` is not enough: usage has to actually arrive.
  assert.equal(result.capabilities.streamUsage.verdict, 'no');
  assert.equal(result.capabilities.promptCaching.verdict, 'ok');
  assert.deepEqual(steps, [
    'models',
    'chat',
    'tools',
    'parallelToolCalls',
    'reasoning',
    'vision',
    'streamUsage',
    'promptCaching',
  ]);
});

test('usage in stream passes only when a chunk carries usage', async () => {
  const result = await probeEndpoint(
    { endpoint },
    {
      transport: transportWith((body) =>
        body.stream_options
          ? sse([streamChunk, { choices: [], usage: { prompt_tokens: 5, completion_tokens: 1 } }])
          : body.stream
            ? sse([streamChunk])
            : json({ choices: [] }),
      ),
    },
  );
  assert.equal(result.capabilities.streamUsage.verdict, 'ok');
});

test('parallel tool calls are skipped when tool calls are rejected', async () => {
  const result = await probeEndpoint(
    { endpoint },
    {
      transport: transportWith((body) => {
        if (body.tools) return json({ error: { message: 'tools not supported' } }, 400);
        return body.stream ? sse([streamChunk]) : json({ choices: [] });
      }),
    },
  );
  assert.equal(result.capabilities.tools.verdict, 'no');
  assert.equal(result.capabilities.parallelToolCalls.verdict, 'skipped');
});

test('a model the server does not have stops before the capability checks', async () => {
  let chatCalls = 0;
  const result = await probeEndpoint(
    { endpoint },
    {
      transport: transportWith(() => {
        chatCalls += 1;
        return json({ error: { message: 'model "qwen3:8b" not found' } }, 404);
      }),
    },
  );
  assert.equal(result.chat.verdict, 'no');
  assert.match(result.chat.detail ?? '', /404: model "qwen3:8b" not found/);
  assert.equal(result.capabilities.tools.verdict, 'skipped');
  assert.equal(chatCalls, 1);
});

test('a 200 that is not a token stream is reported, because every reply streams', async () => {
  const result = await probeEndpoint(
    { endpoint },
    { transport: transportWith(() => json({ choices: [{ message: { content: 'ok' } }] })) },
  );
  assert.equal(result.chat.verdict, 'no');
  assert.match(result.chat.detail ?? '', /not as a token stream/);
});

test('with nothing configured, the first discovered model is used', async () => {
  const seen: string[] = [];
  const result = await probeEndpoint(
    { endpoint: { ...endpoint, modelIds: undefined } },
    {
      transport: transportWith(
        (body) => {
          seen.push(body.model);
          return body.stream ? sse([streamChunk]) : json({ choices: [] });
        },
        () => json({ data: [{ id: 'llama3.2' }] }),
      ),
    },
  );
  assert.equal(result.modelId, 'llama3.2');
  assert.ok(seen.length > 0 && seen.every((model) => model === 'llama3.2'));
});

test('with no model at all the chat checks are skipped with a reason', async () => {
  const result = await probeEndpoint(
    { endpoint: { ...endpoint, modelIds: undefined } },
    {
      transport: transportWith(
        () => json({ choices: [] }),
        () => json({ data: [] }),
      ),
    },
  );
  assert.equal(result.models.verdict, 'ok');
  assert.equal(result.modelId, undefined);
  assert.equal(result.chat.verdict, 'skipped');
  assert.match(result.chat.detail ?? '', /No model to test with/);
});

test('cancelling rejects instead of producing a half result', async () => {
  const controller = new AbortController();
  const promise = probeEndpoint(
    { endpoint },
    {
      signal: controller.signal,
      transport: transportWith(
        () => json({ choices: [] }),
        () =>
          new Promise((_resolve, reject) => {
            controller.signal.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
          }),
      ),
    },
  );
  controller.abort();
  await assert.rejects(promise, (error: unknown) => (error as Error).name === 'AbortError');
});

test('detected capabilities change only what the probe decided', () => {
  const current = endpointCapabilities({
    ...endpoint,
    capabilities: { tools: true, vision: true },
  });
  const next = detectedCapabilities(
    {
      models: { verdict: 'ok', ids: [] },
      modelId: 'qwen3:8b',
      chat: { verdict: 'ok' },
      capabilities: {
        tools: { verdict: 'no' },
        parallelToolCalls: { verdict: 'skipped' },
        reasoning: { verdict: 'ok' },
        vision: { verdict: 'unknown' },
        streamUsage: { verdict: 'ok' },
        promptCaching: { verdict: 'no' },
      },
    },
    current,
  );
  assert.deepEqual(next, {
    tools: false,
    parallelToolCalls: false,
    reasoning: true,
    vision: true,
    streamUsage: true,
    promptCaching: false,
  });
});

test('SSE parsing ignores [DONE] and lines that are not JSON', () => {
  const chunks = parseSseChunks(
    ['data: {"a":1}', ': comment', 'data: not json', 'data: [DONE]', ''].join('\n'),
  );
  assert.deepEqual(chunks, [{ a: 1 }]);
});
