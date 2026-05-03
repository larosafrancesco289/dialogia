import { buildChatBody } from '@/lib/openrouter/request';
import type { ProviderSort } from '@/lib/models/providerSort';
import type {
  ModelMessage,
  PluginConfig,
  StoreAccess,
  ToolDefinition,
  TurnContext,
} from '@/lib/agent/types';
import type { ReasoningEffort } from '@/lib/types';

export const DEBUG_LOG_TTL_MS = 1000 * 60 * 60 * 2;
export const DEBUG_LOG_MAX_ENTRIES = 50;

export type BuildDebugBodyArgs = {
  modelId: string;
  messages: ModelMessage[];
  stream: boolean;
  includeUsage?: boolean;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  reasoningEffort?: ReasoningEffort;
  reasoningTokens?: number;
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  parallelToolCalls?: boolean;
  providerSort?: ProviderSort;
  zdrOnly?: boolean;
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
    topP: args.topP,
    maxTokens: args.maxTokens,
    reasoningEffort: args.reasoningEffort,
    reasoningTokens: args.reasoningTokens,
    tools: args.tools,
    toolChoice: args.toolChoice,
    parallelToolCalls: args.parallelToolCalls,
    providerSort: args.providerSort,
    zdrOnly: args.zdrOnly,
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
  reasoningEffort?: ReasoningEffort;
  reasoningTokens?: number;
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  parallelToolCalls?: boolean;
  providerSort?: ProviderSort;
  zdrOnly?: boolean;
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
    topP: options.topP,
    maxTokens: options.maxTokens,
    reasoningEffort: options.reasoningEffort,
    reasoningTokens: options.reasoningTokens,
    tools: options.tools,
    toolChoice: options.toolChoice,
    parallelToolCalls: options.parallelToolCalls,
    providerSort: options.providerSort,
    zdrOnly: options.zdrOnly,
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
  round,
  ...rest
}: { turn: TurnContext; messageId: string; round?: number } & RequestDebugOptions) {
  const current = turn.get();
  if (!current?.ui?.debug?.mode) return;
  // Use compound key when round is provided so tool-calling rounds don't overwrite each other
  const debugKey = round != null ? `${messageId}_r${round}` : messageId;
  try {
    captureDebugPayload(turn, debugKey, () => buildRequestDebugBody(rest));
  } catch {
    /* ignore debug capture failures */
  }
}
