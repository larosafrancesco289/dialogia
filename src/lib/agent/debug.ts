import {
  buildDebugBody,
  DEBUG_LOG_MAX_ENTRIES,
  DEBUG_LOG_TTL_MS,
} from '@/lib/agent/request';
import type { ProviderSort } from '@/lib/models/providerSort';
import type { PluginConfig, ToolDefinition, TurnContext } from '@/lib/agent/types';

export type RequestDebugOptions = {
  modelId: string;
  messages: unknown[];
  stream: boolean;
  includeUsage?: boolean;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
  reasoningTokens?: number;
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  parallelToolCalls?: boolean;
  providerSort?: ProviderSort;
  plugins?: PluginConfig[];
  canImageOut?: boolean;
};

export function buildRequestDebugBody(options: RequestDebugOptions) {
  return buildDebugBody({
    modelId: options.modelId,
    messages: options.messages,
    stream: options.stream,
    includeUsage: options.includeUsage,
    temperature: options.temperature,
    top_p: options.topP,
    max_tokens: options.maxTokens,
    reasoningEffort: options.reasoningEffort,
    reasoningTokens: options.reasoningTokens,
    tools: options.tools,
    toolChoice: options.toolChoice,
    parallelToolCalls: options.parallelToolCalls,
    providerSort: options.providerSort,
    plugins: options.plugins,
    canImageOut: options.canImageOut,
  });
}

export function captureRequestDebug({
  turn,
  messageId,
  ...rest
}: { turn: TurnContext; messageId: string } & RequestDebugOptions) {
  const current = turn.get();
  if (!current?.ui?.debugMode) return;
  try {
    const payload = buildRequestDebugBody(rest);
    const now = Date.now();
    const existing = current.ui.debugByMessageId || {};
    const entries = Object.entries(existing).filter(([id, value]) => {
      if (id === messageId) return false;
      const createdAt = typeof value?.createdAt === 'number' ? value.createdAt : 0;
      return now - createdAt <= DEBUG_LOG_TTL_MS;
    });
    let bodyStr = '';
    if (typeof payload === 'string') bodyStr = payload;
    else {
      try {
        bodyStr = JSON.stringify(payload);
      } catch {
        bodyStr = String(payload);
      }
    }
    entries.push([messageId, { body: bodyStr, createdAt: now }]);
    entries.sort((a, b) => (a[1].createdAt ?? 0) - (b[1].createdAt ?? 0));
    const trimmed = entries.slice(-DEBUG_LOG_MAX_ENTRIES);

    turn.set({
      ui: {
        ...current.ui,
        debugByMessageId: Object.fromEntries(trimmed),
      },
    });
  } catch {
    /* ignore debug capture failures */
  }
}
