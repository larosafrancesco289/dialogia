import { buildChatBody } from '@/lib/agent/request';
import type { ProviderSort } from '@/lib/models/providerSort';
import type {
  ModelMessage,
  PluginConfig,
  StoreAccess,
  ToolDefinition,
  TurnContext,
} from '@/lib/agent/types';

export const DEBUG_LOG_TTL_MS = 1000 * 60 * 60 * 2;
export const DEBUG_LOG_MAX_ENTRIES = 50;

export type BuildDebugBodyArgs = {
  modelId: string;
  messages: ModelMessage[];
  stream: boolean;
  includeUsage?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
  reasoningTokens?: number;
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  parallelToolCalls?: boolean;
  providerSort?: ProviderSort;
  plugins?: PluginConfig[];
  canImageOut?: boolean;
};

export function buildDebugBody(args: BuildDebugBodyArgs) {
  return buildChatBody({
    model: args.modelId,
    messages: args.messages,
    stream: args.stream,
    includeUsage: args.includeUsage,
    temperature: args.temperature,
    top_p: args.top_p,
    max_tokens: args.max_tokens,
    reasoning_effort: args.reasoningEffort,
    reasoning_tokens: args.reasoningTokens,
    tools: args.tools,
    tool_choice: args.toolChoice,
    parallel_tool_calls: args.parallelToolCalls,
    providerSort: args.providerSort,
    plugins: args.plugins,
    modalities: args.canImageOut ? (['image', 'text'] as Array<'image' | 'text'>) : undefined,
  });
}

export type RequestDebugOptions = {
  modelId: string;
  messages: ModelMessage[];
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

export function recordDebugIfEnabled(store: StoreAccess, messageId: string, body: unknown) {
  if (!messageId) return;
  if (!store.get().ui.debug.mode) return;
  let payload = '';
  if (typeof body === 'string') {
    payload = body;
  } else {
    try {
      payload = JSON.stringify(body, null, 2);
    } catch {
      payload = String(body);
    }
  }
  const now = Date.now();
  store.set((state) => {
    const existing = state.ui.debug.byMessageId || {};
    const entries = Object.entries(existing).filter(([id, value]) => {
      if (id === messageId) return false;
      const createdAt = typeof value?.createdAt === 'number' ? value.createdAt : 0;
      return now - createdAt <= DEBUG_LOG_TTL_MS;
    });
    entries.push([messageId, { body: payload, createdAt: now }]);
    entries.sort((a, b) => (a[1].createdAt ?? 0) - (b[1].createdAt ?? 0));
    const trimmed = entries.slice(-DEBUG_LOG_MAX_ENTRIES);
    return {
      ui: {
        ...state.ui,
        debug: {
          ...state.ui.debug,
          byMessageId: Object.fromEntries(trimmed),
        },
      },
    };
  });
}

export function captureDebugPayload(
  turn: TurnContext,
  messageId: string,
  build: () => unknown,
): void {
  try {
    const payload = build();
    recordDebugIfEnabled({ set: turn.set, get: turn.get }, messageId, payload);
  } catch {
    /* ignore debug capture failures */
  }
}

export function captureRequestDebug({
  turn,
  messageId,
  ...rest
}: { turn: TurnContext; messageId: string } & RequestDebugOptions) {
  const current = turn.get();
  if (!current?.ui?.debug?.mode) return;
  try {
    captureDebugPayload(turn, messageId, () => buildRequestDebugBody(rest));
  } catch {
    /* ignore debug capture failures */
  }
}
