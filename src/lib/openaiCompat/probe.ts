// Module: openaiCompat/probe
// Responsibility: Replace capability guesswork for a user-configured endpoint
// with observation. Each check sends one tiny request carrying exactly the
// field its capability gates, so "accepted" means what the toggle means: this
// server takes that field without rejecting the whole request.

import { withAbortTimeout } from '@/lib/api/http';
import type { TransportAuth } from '@/lib/auth/transport';
import { formatOpenRouterErrorDetail, readOpenRouterErrorDetail } from '@/lib/openrouter/errors';
import { orChatCompletions, orFetchModels } from '@/lib/openrouter/http';
import type { OpenRouterChatRequest } from '@/lib/openrouter/types';
import type { ModelMessage, ToolDefinition } from '@/lib/transport/contracts';
import type { EndpointCapabilities } from '@/lib/transport/endpoints';
import { isRecord } from '@/lib/utils/guards';

export type ProbeCapability = keyof EndpointCapabilities;

/** In the order they run; `parallelToolCalls` needs `tools` to have passed. */
export const PROBED_CAPABILITIES: readonly ProbeCapability[] = [
  'tools',
  'parallelToolCalls',
  'reasoning',
  'vision',
  'streamUsage',
  'promptCaching',
];

export type ProbeStep = 'models' | 'chat' | ProbeCapability;

export type ProbeVerdict = 'ok' | 'no' | 'unknown' | 'skipped';

export type ProbeCheck = { verdict: ProbeVerdict; detail?: string };

export type ModelsProbe =
  | { verdict: 'ok'; ids: string[] }
  | { verdict: 'no-route' }
  | { verdict: 'unauthorized'; detail: string }
  | { verdict: 'unreachable'; detail: string }
  | { verdict: 'failed'; detail: string };

export type EndpointProbeResult = {
  models: ModelsProbe;
  /** The model the chat checks ran against; absent when there was none to try. */
  modelId?: string;
  chat: ProbeCheck & { latencyMs?: number };
  capabilities: Record<ProbeCapability, ProbeCheck>;
};

export type ProbeTransport = {
  models: (auth: TransportAuth, signal: AbortSignal) => Promise<Response>;
  chat: (
    auth: TransportAuth,
    body: OpenRouterChatRequest,
    signal: AbortSignal,
  ) => Promise<Response>;
};

export type ProbeOptions = {
  /** Overrides the default of the first configured id, then the first discovered one. */
  modelId?: string;
  signal?: AbortSignal;
  onStep?: (step: ProbeStep) => void;
  transport?: ProbeTransport;
};

const DEFAULT_TRANSPORT: ProbeTransport = {
  models: (auth, signal) => orFetchModels(auth, { signal }),
  chat: (auth, body, signal) => orChatCompletions({ auth, body, signal, stream: body.stream }),
};

/** A local model may still be loading into memory on the first request. */
const TIMEOUTS = Object.freeze({ models: 20_000, firstChat: 90_000, chat: 45_000 });

const MAX_DETAIL_LENGTH = 200;

const PROBE_PROMPT = 'Reply with the single word: ok';

const PROBE_MESSAGES: ModelMessage[] = [{ role: 'user', content: PROBE_PROMPT }];

const PROBE_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'ping',
    description: 'Connectivity check. Never call it.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
};

/** A 1×1 transparent PNG: the smallest image a server can be asked to accept. */
const PROBE_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function baseBody(model: string, stream: boolean): OpenRouterChatRequest {
  return { model, messages: PROBE_MESSAGES, stream, max_tokens: 8 };
}

/** What each capability adds to the minimal body: exactly what `buildChatBody` would gate on it. */
const CAPABILITY_BODIES: Record<ProbeCapability, (model: string) => OpenRouterChatRequest> = {
  tools: (model) => ({ ...baseBody(model, false), tools: [PROBE_TOOL], tool_choice: 'auto' }),
  parallelToolCalls: (model) => ({
    ...baseBody(model, false),
    tools: [PROBE_TOOL],
    tool_choice: 'auto',
    parallel_tool_calls: true,
  }),
  reasoning: (model) => ({ ...baseBody(model, false), reasoning: { effort: 'low' } }),
  vision: (model) => ({
    ...baseBody(model, false),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What colour is this image? One word.' },
          { type: 'image_url', image_url: { url: PROBE_IMAGE } },
        ],
      },
    ],
  }),
  streamUsage: (model) => ({ ...baseBody(model, true), stream_options: { include_usage: true } }),
  promptCaching: (model) => ({
    ...baseBody(model, false),
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: PROBE_PROMPT, cache_control: { type: 'ephemeral' } }],
      },
    ],
  }),
};

function abortError(): Error {
  return new DOMException('The connection test was cancelled.', 'AbortError');
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function truncate(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > MAX_DETAIL_LENGTH
    ? `${oneLine.slice(0, MAX_DETAIL_LENGTH - 1)}…`
    : oneLine;
}

async function describeFailure(res: Response): Promise<string> {
  const detail = formatOpenRouterErrorDetail(
    await readOpenRouterErrorDetail(res).catch(() => undefined),
  );
  return truncate(detail ? `${res.status}: ${detail}` : `HTTP ${res.status}`);
}

function describeThrown(error: unknown, timeoutMs: number): string {
  if (isAbortError(error)) return `No answer within ${Math.round(timeoutMs / 1000)} s.`;
  const message = truncate(error instanceof Error ? error.message : String(error));
  if (!message) return 'The request failed before the server answered.';
  return /[.!?]$/.test(message) ? message : `${message}.`;
}

/** Every JSON payload on a `data:` line, ignoring `[DONE]` and anything unparseable. */
export function parseSseChunks(text: string): unknown[] {
  const chunks: unknown[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      chunks.push(JSON.parse(payload));
    } catch {
      // A truncated or non-JSON line says nothing about the server.
    }
  }
  return chunks;
}

function readModelIds(payload: unknown): string[] {
  const entries = isRecord(payload) && Array.isArray(payload.data) ? payload.data : [];
  const ids: string[] = [];
  for (const entry of entries) {
    if (typeof entry === 'string') ids.push(entry);
    else if (isRecord(entry) && typeof entry.id === 'string' && entry.id) ids.push(entry.id);
  }
  return ids;
}

function skipped(detail: string): Record<ProbeCapability, ProbeCheck> {
  const checks = {} as Record<ProbeCapability, ProbeCheck>;
  for (const capability of PROBED_CAPABILITIES) checks[capability] = { verdict: 'skipped', detail };
  return checks;
}

/**
 * The verdicts folded onto the current toggles. An accepted field turns on,
 * a rejected one turns off, and anything the probe could not decide is left
 * exactly as the user had it.
 */
export function detectedCapabilities(
  result: EndpointProbeResult,
  current: Required<EndpointCapabilities>,
): Required<EndpointCapabilities> {
  const next = { ...current };
  for (const capability of PROBED_CAPABILITIES) {
    const { verdict } = result.capabilities[capability];
    if (verdict === 'ok') next[capability] = true;
    else if (verdict === 'no') next[capability] = false;
  }
  return next;
}

export async function probeEndpoint(
  auth: TransportAuth,
  options: ProbeOptions = {},
): Promise<EndpointProbeResult> {
  const transport = options.transport ?? DEFAULT_TRANSPORT;
  const outer = options.signal;

  const send = async <T>(
    timeoutMs: number,
    run: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> => {
    if (outer?.aborted) throw abortError();
    const { signal, cleanup } = withAbortTimeout({ signal: outer, timeoutMs });
    try {
      return await run(signal);
    } catch (error) {
      if (outer?.aborted) throw abortError();
      throw error;
    } finally {
      cleanup();
    }
  };

  options.onStep?.('models');
  let models: ModelsProbe;
  const discovered: string[] = [];
  try {
    const res = await send(TIMEOUTS.models, (signal) => transport.models(auth, signal));
    if (res.ok) {
      discovered.push(...readModelIds(await res.json().catch(() => null)));
      models = { verdict: 'ok', ids: discovered };
    } else if (res.status === 404) {
      models = { verdict: 'no-route' };
    } else if (res.status === 401 || res.status === 403) {
      models = { verdict: 'unauthorized', detail: await describeFailure(res) };
    } else {
      models = { verdict: 'failed', detail: await describeFailure(res) };
    }
  } catch (error) {
    if (isAbortError(error) && outer?.aborted) throw error;
    models = { verdict: 'unreachable', detail: describeThrown(error, TIMEOUTS.models) };
  }

  if (models.verdict === 'unreachable') {
    return {
      models,
      chat: { verdict: 'skipped', detail: 'The server could not be reached.' },
      capabilities: skipped('The server could not be reached.'),
    };
  }

  const modelId = options.modelId ?? auth.endpoint.modelIds?.[0] ?? discovered[0];
  if (!modelId) {
    const detail = 'No model to test with. Type a model id above, or check what the server lists.';
    return { models, chat: { verdict: 'skipped', detail }, capabilities: skipped(detail) };
  }

  options.onStep?.('chat');
  const startedAt = Date.now();
  let chat: EndpointProbeResult['chat'];
  try {
    const res = await send(TIMEOUTS.firstChat, (signal) =>
      transport.chat(auth, baseBody(modelId, true), signal),
    );
    if (!res.ok) {
      chat = { verdict: 'no', detail: await describeFailure(res) };
    } else {
      const text = await res.text();
      const chunks = parseSseChunks(text);
      if (chunks.some((chunk) => isRecord(chunk) && Array.isArray(chunk.choices))) {
        chat = { verdict: 'ok', latencyMs: Date.now() - startedAt };
      } else {
        chat = {
          verdict: 'no',
          detail: 'Answered, but not as a token stream. Dialogia streams every reply.',
        };
      }
    }
  } catch (error) {
    if (isAbortError(error) && outer?.aborted) throw error;
    chat = { verdict: 'unknown', detail: describeThrown(error, TIMEOUTS.firstChat) };
  }

  if (chat.verdict !== 'ok') {
    return {
      models,
      modelId,
      chat,
      capabilities: skipped('Skipped because the first message did not get through.'),
    };
  }

  const capabilities = {} as Record<ProbeCapability, ProbeCheck>;
  for (const capability of PROBED_CAPABILITIES) {
    if (capability === 'parallelToolCalls' && capabilities.tools.verdict !== 'ok') {
      capabilities[capability] = { verdict: 'skipped', detail: 'Needs tool calls.' };
      continue;
    }
    options.onStep?.(capability);
    const body = CAPABILITY_BODIES[capability](modelId);
    try {
      const res = await send(TIMEOUTS.chat, (signal) => transport.chat(auth, body, signal));
      if (!res.ok) {
        capabilities[capability] = { verdict: 'no', detail: await describeFailure(res) };
      } else if (capability === 'streamUsage') {
        const chunks = parseSseChunks(await res.text());
        const reported = chunks.some((chunk) => isRecord(chunk) && isRecord(chunk.usage));
        capabilities[capability] = reported
          ? { verdict: 'ok' }
          : { verdict: 'no', detail: 'Accepted the field, but no usage came back.' };
      } else {
        capabilities[capability] = { verdict: 'ok' };
      }
    } catch (error) {
      if (isAbortError(error) && outer?.aborted) throw error;
      capabilities[capability] = {
        verdict: 'unknown',
        detail: describeThrown(error, TIMEOUTS.chat),
      };
    }
  }

  return { models, modelId, chat, capabilities };
}
