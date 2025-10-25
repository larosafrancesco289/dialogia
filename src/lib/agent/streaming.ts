// Module: agent/streaming
// Responsibility: Stream final assistant responses and propagate token callbacks.

import { getStreamChatCompletion } from '@/lib/agent/pipelineClient';
import { buildDebugBody, recordDebugIfEnabled } from '@/lib/agent/request';
import { createMessageStreamCallbacks } from '@/lib/agent/streamHandlers';
import { isToolCallingSupported } from '@/lib/models';
import { clearTurnController } from '@/lib/services/controllers';
import type { StreamFinalOptions, ToolDefinition } from '@/lib/agent/types';

const TOOL_FENCE_REGEX = /^\s*```([a-z0-9_-]+)?\s*\n([\s\S]*?)\n```\s*/i;
const TOOL_LANGS = new Set(['json', 'jsonc', 'tool', 'function', 'callback']);

function findJsonObjectEnd(value: string): number | null {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return i + 1;
      if (depth < 0) return null;
    }
  }
  return null;
}

export function stripLeadingToolJson(input: string): string {
  if (!input) return input;
  const trimmed = input.trimStart();
  if (!trimmed) return trimmed;

  const fenceMatch = trimmed.match(TOOL_FENCE_REGEX);
  if (fenceMatch) {
    const lang = fenceMatch[1]?.toLowerCase();
    if (lang && !TOOL_LANGS.has(lang)) return input;
    return trimmed.slice(fenceMatch[0].length).trimStart();
  }

  if (trimmed.startsWith('{')) {
    const endIndex = findJsonObjectEnd(trimmed);
    if (endIndex != null) {
      const jsonCandidate = trimmed.slice(0, endIndex).trim();
      try {
        JSON.parse(jsonCandidate);
      } catch {
        return input;
      }
      return trimmed.slice(endIndex).trimStart();
    }
  }

  return input;
}

export async function streamFinal(opts: StreamFinalOptions): Promise<void> {
  const {
    chat,
    chatId,
    assistantMessage,
    messages,
    controller,
    apiKey,
    transport = 'openrouter',
    providerSort,
    set,
    get,
    modelIndex,
    persistMessage,
    plugins,
    toolDefinition,
    startBuffered,
  } = opts;

  const modelMeta = modelIndex.get(chat.settings.model);
  const caps = modelIndex.caps(chat.settings.model);
  const supportsReasoning = caps.canReason;
  const canImageOut = caps.canImageOut;
  const supportsTools = isToolCallingSupported(modelMeta);
  const includeTools =
    supportsTools && Array.isArray(toolDefinition) && toolDefinition.length > 0;
  const combinedPlugins = Array.isArray(plugins) && plugins.length > 0 ? plugins : undefined;
  const toolsForStreaming = includeTools ? (toolDefinition as ToolDefinition[]) : undefined;

  try {
    const dbg = buildDebugBody({
      modelId: chat.settings.model,
      messages: messages as any,
      stream: true,
      includeUsage: true,
      canImageOut,
      temperature: chat.settings.temperature,
      top_p: chat.settings.top_p,
      max_tokens: chat.settings.max_tokens,
      reasoningEffort: supportsReasoning ? chat.settings.reasoning_effort : undefined,
      reasoningTokens: supportsReasoning ? chat.settings.reasoning_tokens : undefined,
      tools: toolsForStreaming,
      toolChoice: includeTools ? 'none' : undefined,
      providerSort,
      plugins: combinedPlugins,
    });
    recordDebugIfEnabled({ set, get }, assistantMessage.id, dbg);
  } catch {
    // ignore debug capture issues
  }

  const requestedEffort = supportsReasoning ? chat.settings.reasoning_effort : undefined;
  const requestedTokensRaw = supportsReasoning ? chat.settings.reasoning_tokens : undefined;
  const effortRequested = typeof requestedEffort === 'string' && requestedEffort !== 'none';
  const tokensRequested = typeof requestedTokensRaw === 'number' && requestedTokensRaw > 0;
  const autoReasoningEligible = !effortRequested && !tokensRequested;
  const modelIdUsed = chat.settings.model;
  const tStart = performance.now();
  const callbacks = createMessageStreamCallbacks(
    {
      chatId,
      assistantMessage,
      set,
      get,
      startBuffered,
      autoReasoningEligible,
      modelIdUsed,
      clearController: () => clearTurnController(chatId),
      persistMessage,
    },
    { startedAt: tStart },
  );

  await getStreamChatCompletion()({
    apiKey,
    transport,
    model: chat.settings.model,
    messages,
    modalities: canImageOut ? (['image', 'text'] as any) : undefined,
    temperature: chat.settings.temperature,
    top_p: chat.settings.top_p,
    max_tokens: chat.settings.max_tokens,
    reasoning_effort: supportsReasoning ? chat.settings.reasoning_effort : undefined,
    reasoning_tokens: supportsReasoning ? chat.settings.reasoning_tokens : undefined,
    signal: controller.signal,
    tools: toolsForStreaming,
    tool_choice: includeTools ? ('none' as any) : undefined,
    providerSort,
    plugins: combinedPlugins,
    callbacks,
  });
}
