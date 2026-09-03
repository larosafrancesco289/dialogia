// Module: agent/streaming/streamCall
// Responsibility: One model call inside a streaming turn. Every round of the
// turn sends the same request shape and differs only in messages, tools and
// callbacks, so the request assembly and the debug capture live here once.

import { getStreamChatCompletion } from '@/lib/agent/pipelineClient';
import { captureRequestDebug } from '@/lib/agent/debug';
import { isReasoningRequested } from '@/lib/settings/generation';
import { shouldIncludeUsage } from '@/lib/api/normalizers';
import type { ModelMessage, StreamFinalOptions, ToolCall, ToolDefinition } from '@/lib/agent/types';
import type { StreamCallbacks, StreamDoneExtras } from '@/lib/transport/types';

export type StreamCallContext = {
  opts: StreamFinalOptions;
  generation: StreamFinalOptions['settings']['generation'];
  modalities: Array<'image' | 'text'> | undefined;
  disableReasoning: boolean;
  canImageOut: boolean;
  plugins: StreamFinalOptions['plugins'];
};

export function createStreamCallContext(
  opts: StreamFinalOptions,
  caps: { canImageOut: boolean; canReason: boolean },
): StreamCallContext {
  const generation = opts.settings.generation;
  return {
    opts,
    generation,
    modalities: caps.canImageOut ? ['image', 'text'] : undefined,
    disableReasoning: caps.canReason && !isReasoningRequested(generation),
    canImageOut: caps.canImageOut,
    plugins: Array.isArray(opts.plugins) && opts.plugins.length > 0 ? opts.plugins : undefined,
  };
}

export type StreamCallParams = {
  messages: ModelMessage[];
  tools: ToolDefinition[] | undefined;
  toolChoice: 'auto' | 'none' | undefined;
  callbacks: StreamCallbacks;
  round?: number;
};

export async function executeStreamCall(
  ctx: StreamCallContext,
  params: StreamCallParams,
): Promise<void> {
  const { opts, generation, modalities, disableReasoning, canImageOut, plugins } = ctx;
  const { turn, settings, controller } = opts;
  const zdrOnly = turn.get()?.ui?.zdrOnly === true;

  captureRequestDebug({
    turn,
    messageId: opts.assistantMessage.id,
    round: params.round,
    modelId: settings.modelId,
    messages: params.messages,
    stream: true,
    includeUsage: shouldIncludeUsage(true),
    canImageOut,
    temperature: generation.temperature,
    topP: generation.topP,
    maxTokens: generation.maxTokens,
    reasoningEffort: generation.reasoningEffort,
    reasoningTokens: generation.reasoningTokens,
    tools: params.tools,
    toolChoice: params.toolChoice,
    providerSort: generation.providerSort,
    zdrOnly,
    plugins,
  });

  await getStreamChatCompletion(opts.pipeline)({
    auth: turn.auth,
    model: settings.modelId,
    messages: params.messages,
    modalities,
    temperature: generation.temperature,
    topP: generation.topP,
    maxTokens: generation.maxTokens,
    reasoningEffort: generation.reasoningEffort,
    reasoningTokens: generation.reasoningTokens,
    disableReasoning,
    providerSort: generation.providerSort,
    zdrOnly,
    signal: controller.signal,
    tools: params.tools,
    toolChoice: params.toolChoice,
    plugins,
    callbacks: params.callbacks,
  });
}

/** What one round of streaming produced, read after the call resolves. */
export type RoundCapture = {
  content: string;
  reasoningText: string;
  full: string;
  extras?: StreamDoneExtras;
  finishReason?: StreamDoneExtras['finishReason'];
  reasoningDetails?: StreamDoneExtras['reasoningDetails'];
  toolCalls: ToolCall[];
};

export function roundWantsTools(round: RoundCapture): boolean {
  return round.finishReason === 'tool_calls' && round.toolCalls.length > 0;
}

/**
 * Callbacks that record a round. Token and reasoning deltas are forwarded to
 * `forward` when given, so the first round can paint the UI live while later
 * rounds stay silent. `onDone` is never forwarded: whether the UI is told the
 * turn ended depends on what the round produced, which only the caller knows.
 */
export function captureRound(options: {
  forward?: StreamCallbacks;
  onToolCallDelta?: StreamCallbacks['onToolCallDelta'];
}): { callbacks: StreamCallbacks; round: RoundCapture } {
  const { forward, onToolCallDelta } = options;
  const round: RoundCapture = { content: '', reasoningText: '', full: '', toolCalls: [] };
  const callbacks: StreamCallbacks = {
    ...forward,
    onToken: (delta) => {
      round.content += delta;
      forward?.onToken?.(delta);
    },
    onReasoningToken: (delta) => {
      round.reasoningText += delta;
      forward?.onReasoningToken?.(delta);
    },
    onToolCallDelta,
    onDone: (full, extras) => {
      round.full = full;
      round.extras = extras;
      round.finishReason = extras?.finishReason;
      round.reasoningDetails = extras?.reasoningDetails;
      if (extras?.toolCalls) round.toolCalls = extras.toolCalls;
    },
  };
  return { callbacks, round };
}
