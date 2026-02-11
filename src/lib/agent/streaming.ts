// Module: agent/streaming
// Responsibility: Stream final assistant responses and propagate token callbacks.

import { getStreamChatCompletion } from '@/lib/agent/pipelineClient';
import { captureRequestDebug } from '@/lib/agent/debug';
import { applyCacheBreakpoints } from '@/lib/agent/cache';
import { createMessageStreamCallbacks } from '@/lib/agent/streamHandlers';
import { isToolCallingSupported } from '@/lib/models';
import { clearTurnController } from '@/lib/turns/runtime';
import { isReasoningRequested } from '@/lib/settings/generation';
import type { StreamFinalOptions, ToolDefinition } from '@/lib/agent/types';
import { shouldIncludeUsage } from '@/lib/api/normalizers';

export async function streamFinal(opts: StreamFinalOptions): Promise<void> {
  const {
    chatId,
    assistantMessage,
    messages,
    controller,
    turn,
    settings,
    plugins,
    toolDefinition,
    startBuffered,
  } = opts;
  const { auth, set, get, modelIndex, persistMessage } = turn;

  const modelMeta = settings.modelMeta ?? modelIndex.get(settings.modelId);
  const caps = settings.caps ?? modelIndex.caps(settings.modelId);
  const canImageOut = caps.canImageOut;
  const supportsTools = isToolCallingSupported(modelMeta);
  const includeTools = supportsTools && Array.isArray(toolDefinition) && toolDefinition.length > 0;
  const combinedPlugins = Array.isArray(plugins) && plugins.length > 0 ? plugins : undefined;
  const toolsForStreaming = includeTools ? (toolDefinition as ToolDefinition[]) : undefined;
  const generation = settings.generation;

  const cachedMessages = applyCacheBreakpoints(messages);

  captureRequestDebug({
    turn,
    messageId: assistantMessage.id,
    modelId: settings.modelId,
    messages: cachedMessages,
    stream: true,
    includeUsage: shouldIncludeUsage(true),
    canImageOut,
    temperature: generation.temperature,
    topP: generation.topP,
    maxTokens: generation.maxTokens,
    reasoningEffort: generation.reasoningEffort,
    reasoningTokens: generation.reasoningTokens,
    tools: toolsForStreaming,
    toolChoice: includeTools ? 'none' : undefined,
    providerSort: generation.providerSort,
    plugins: combinedPlugins,
  });

  const disableReasoning = caps.canReason && !isReasoningRequested(generation);
  const modelIdUsed = settings.modelId;
  const tStart = performance.now();
  const callbacks = createMessageStreamCallbacks(
    {
      chatId,
      assistantMessage,
      set,
      get,
      startBuffered,
      autoReasoningEligible: disableReasoning,
      modelIdUsed,
      clearController: () => clearTurnController(chatId, controller),
      persistMessage,
    },
    { startedAt: tStart },
  );

  const modalities = canImageOut ? (['image', 'text'] as Array<'image' | 'text'>) : undefined;
  const toolChoice = includeTools ? 'none' : undefined;
  await getStreamChatCompletion(opts.pipeline)({
    auth,
    model: settings.modelId,
    messages: cachedMessages,
    modalities,
    temperature: generation.temperature,
    topP: generation.topP,
    maxTokens: generation.maxTokens,
    reasoningEffort: generation.reasoningEffort,
    reasoningTokens: generation.reasoningTokens,
    disableReasoning,
    providerSort: generation.providerSort,
    signal: controller.signal,
    tools: toolsForStreaming,
    toolChoice,
    plugins: combinedPlugins,
    callbacks,
  });
}
