#!/usr/bin/env tsx
// `bun run smoke:providers`: a handful of real calls through the app's own transports, to
// catch a provider changing under us (a renamed field, a new error shape, a retired model)
// before a user does. A run costs a fraction of a cent. Keys come from the environment,
// .env.local or .env; a provider without one is skipped.

import { isApiError, API_ERROR_CODES } from '@/lib/api/errors';
import { buildTransportAuth, type TransportAuth } from '@/lib/auth/transport';
import { loadEnvDefaults } from '@/lib/cli/env.node';
import {
  getAnthropicKeyFallback,
  getAnthropicWorkspaceFallback,
  getOpenRouterKeyFallback,
} from '@/lib/env/keys';
import { isAbortLike } from '@/lib/store/notices';
import { ANTHROPIC_ENDPOINT, OPENROUTER_ENDPOINT } from '@/lib/transport/endpoints';
import { getTransportClient } from '@/lib/transport/registry';
import type { ModelMessage, ToolCall, ToolDefinition } from '@/lib/transport/contracts';
import type { StreamDoneExtras, TransportClient } from '@/lib/transport/types';

type Provider = {
  name: string;
  auth: TransportAuth;
  badAuth: TransportAuth;
  client: TransportClient;
  /** Picks the cheap model to call from the listed ids. */
  pick: (ids: string[]) => string | undefined;
};

type Outcome = { provider: string; check: string; ok: boolean; detail: string };

const TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'get_weather',
    description: 'The weather in a city.',
    parameters: {
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
    },
  },
};

const haiku = (ids: string[]) => ids.find((id) => /claude-haiku-5[-.]5/.test(id));

async function stream(
  p: Provider,
  model: string,
  messages: ModelMessage[],
  extra: { tools?: ToolDefinition[]; forceTool?: boolean; abortAfterFirstToken?: boolean } = {},
): Promise<{ text: string; extras?: StreamDoneExtras; error?: unknown }> {
  const controller = new AbortController();
  let text = '';
  let extras: StreamDoneExtras | undefined;
  try {
    await p.client.streamChatCompletion({
      auth: p.auth,
      model,
      messages,
      maxTokens: 200,
      signal: controller.signal,
      ...(extra.tools ? { tools: extra.tools } : {}),
      ...(extra.forceTool
        ? { toolChoice: { type: 'function' as const, function: { name: TOOL.function.name } } }
        : {}),
      callbacks: {
        onToken: (delta) => {
          text += delta;
          if (extra.abortAfterFirstToken) controller.abort();
        },
        onDone: (full, done) => {
          text = full;
          extras = done;
        },
      },
    });
    return { text, extras };
  } catch (error) {
    return { text, extras, error };
  }
}

async function runProvider(p: Provider): Promise<Outcome[]> {
  const out: Outcome[] = [];
  const record = (check: string, ok: boolean, detail: string) =>
    out.push({ provider: p.name, check, ok, detail });

  let model: string | undefined;
  try {
    const listed = await p.client.fetchModels(p.auth);
    model = p.pick(listed.map((m) => m.id));
    record('models', !!model, model ? `${listed.length} listed; using ${model}` : 'no Haiku 5.5');
  } catch (error) {
    record('models', false, String(error).slice(0, 160));
  }
  if (!model) return out;

  const plain = await stream(p, model, [
    { role: 'user', content: 'Reply with the single word: pong' },
  ]);
  record(
    'stream',
    !plain.error && /pong/i.test(plain.text) && plain.extras?.finishReason === 'stop',
    plain.error
      ? String(plain.error).slice(0, 160)
      : `"${plain.text.trim().slice(0, 40)}", finish ${plain.extras?.finishReason}, usage ${plain.extras?.usage ? 'yes' : 'no'}`,
  );

  const asked: ModelMessage = { role: 'user', content: 'What is the weather in Paris?' };
  const first = await stream(p, model, [asked], { tools: [TOOL], forceTool: true });
  const call: ToolCall | undefined = first.extras?.toolCalls?.[0];
  let args: unknown;
  try {
    args = call ? JSON.parse(call.function.arguments) : undefined;
  } catch {
    args = undefined;
  }
  const argsOk =
    !!args && typeof args === 'object' && typeof (args as { city?: unknown }).city === 'string';
  record(
    'tool call',
    !first.error && !!call && argsOk,
    first.error
      ? String(first.error).slice(0, 160)
      : `${call?.function.name}(${call?.function.arguments})`,
  );
  if (call) {
    const second = await stream(
      p,
      model,
      [
        asked,
        { role: 'assistant', content: '', tool_calls: [call] },
        {
          role: 'tool',
          tool_call_id: call.id,
          name: call.function.name,
          content: '{"forecast":"sunny, 21°C"}',
        },
      ],
      { tools: [TOOL] },
    );
    record(
      'tool result',
      !second.error && /sun|21/i.test(second.text),
      second.error ? String(second.error).slice(0, 160) : `"${second.text.trim().slice(0, 60)}"`,
    );
  }

  const stopped = await stream(
    p,
    model,
    [{ role: 'user', content: 'Count slowly from one to fifty, one number per line.' }],
    { abortAfterFirstToken: true },
  );
  record(
    'stop mid-stream',
    !!stopped.error && isAbortLike(stopped.error),
    stopped.error ? `stopped after "${stopped.text.slice(0, 20)}"` : 'finished without stopping',
  );

  const refused = await stream({ ...p, auth: p.badAuth }, model, [{ role: 'user', content: 'hi' }]);
  record(
    'bad key',
    isApiError(refused.error) && refused.error.code === API_ERROR_CODES.UNAUTHORIZED,
    isApiError(refused.error)
      ? `${refused.error.code} (${refused.error.status})`
      : String(refused.error),
  );
  return out;
}

async function main(): Promise<number> {
  await loadEnvDefaults(['.env.local', '.env']);
  const providers: Provider[] = [];
  const anthropicKey = getAnthropicKeyFallback();
  if (anthropicKey) {
    const workspaceId = getAnthropicWorkspaceFallback();
    const endpoint = { ...ANTHROPIC_ENDPOINT, ...(workspaceId ? { workspaceId } : {}) };
    providers.push({
      name: 'Claude API',
      auth: buildTransportAuth({ endpoint, apiKey: anthropicKey }),
      badAuth: buildTransportAuth({ endpoint, apiKey: 'sk-ant-smoke-test-invalid' }),
      client: getTransportClient('anthropic'),
      pick: haiku,
    });
  }
  const openrouterKey = getOpenRouterKeyFallback();
  if (openrouterKey) {
    providers.push({
      name: 'OpenRouter',
      auth: buildTransportAuth({ endpoint: OPENROUTER_ENDPOINT, apiKey: openrouterKey }),
      badAuth: buildTransportAuth({
        endpoint: OPENROUTER_ENDPOINT,
        apiKey: 'sk-or-smoke-test-invalid',
      }),
      client: getTransportClient('openrouter'),
      pick: haiku,
    });
  }
  if (!providers.length) {
    console.log('No ANTHROPIC_API_KEY or OPENROUTER_API_KEY found; nothing to check.');
    return 1;
  }
  const results = (await Promise.all(providers.map(runProvider))).flat();
  for (const r of results) {
    const detail = r.detail.replace(/\s*\n\s*/g, ' ');
    console.log(`${r.ok ? '✓' : '✗'} ${r.provider.padEnd(11)} ${r.check.padEnd(16)} ${detail}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
  return failed ? 1 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  },
);
