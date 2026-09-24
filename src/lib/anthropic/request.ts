// Module: anthropic/request
// Responsibility: Build a Messages API request body from transport params: the
// model id, tools and tool choice, thinking and effort, and prompt caching.

import type { PluginConfig, ToolDefinition } from '@/lib/transport/contracts';
import type { TransportChatParams } from '@/lib/transport/types';
import { isRecord } from '@/lib/utils/guards';
import { withoutToolHistory } from '@/lib/transport/toolHistory';
import {
  ANTHROPIC_DEFAULT_MAX_TOKENS,
  ANTHROPIC_MIN_THINKING_BUDGET,
  defaultAnthropicThinkingBudget,
  normalizeAnthropicModelSlug,
  resolveAnthropicDirectModelId,
  supportsAnthropicAdaptiveThinking,
  supportsAnthropicPromptCaching,
  supportsAnthropicReasoning,
} from '@/lib/anthropic/shared';
import { convertMessages, type UnsupportedContentKind } from '@/lib/anthropic/messages';
import type {
  AnthropicMessageParam,
  AnthropicMessagesRequest,
  AnthropicTextBlock,
  AnthropicToolChoice,
  AnthropicToolDefinition,
  AnthropicWebSearchToolDefinition,
} from '@/lib/anthropic/wire';

const ANTHROPIC_WEB_SEARCH_TOOL: AnthropicWebSearchToolDefinition = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: 5,
};

function countExplicitCacheBreakpoints(params: {
  system?: string | AnthropicTextBlock[];
  messages: AnthropicMessageParam[];
}): number {
  let count = 0;

  if (Array.isArray(params.system)) {
    for (const block of params.system) {
      if (block.cache_control) count += 1;
    }
  }

  for (const message of params.messages) {
    if (!Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (block.type === 'text' && block.cache_control) count += 1;
    }
  }

  return count;
}

function mapToolDefinitions(tools?: ToolDefinition[]): AnthropicToolDefinition[] | undefined {
  if (!Array.isArray(tools) || tools.length === 0) return undefined;
  return tools
    .map((tool) => {
      const fn = tool.function;
      if (!fn?.name) return null;
      return {
        name: fn.name,
        description: fn.description,
        input_schema: isRecord(fn.parameters) ? fn.parameters : { type: 'object', properties: {} },
      };
    })
    .filter((tool): tool is AnthropicToolDefinition => tool !== null);
}

function hasWebPlugin(plugins?: PluginConfig[]): boolean {
  return Array.isArray(plugins) && plugins.some((plugin) => plugin.id === 'web');
}

function mapToolChoice(
  toolChoice: TransportChatParams['toolChoice'],
): AnthropicToolChoice | undefined {
  if (!toolChoice) return undefined;
  if (toolChoice === 'auto') return { type: 'auto' };
  if (toolChoice === 'none') return { type: 'none' };
  return { type: 'tool', name: toolChoice.function.name };
}

function buildThinkingConfig(params: {
  model: string;
  reasoningEffort?: TransportChatParams['reasoningEffort'];
  reasoningTokens?: number;
  disableReasoning?: boolean;
}): Pick<AnthropicMessagesRequest, 'thinking' | 'output_config'> {
  const reasoningSupported = supportsAnthropicReasoning(params.model);
  if (!reasoningSupported) return {};

  const reasoningDisabled = params.disableReasoning || params.reasoningEffort === 'none';
  if (reasoningDisabled) return {};

  const reasoningRequested =
    (typeof params.reasoningEffort === 'string' && params.reasoningEffort !== 'none') ||
    (typeof params.reasoningTokens === 'number' && params.reasoningTokens > 0);

  if (!reasoningRequested) return {};

  if (supportsAnthropicAdaptiveThinking(params.model)) {
    // The Claude API accepts low..max; 'minimal' is an OpenRouter-only level.
    const requested =
      params.reasoningEffort && params.reasoningEffort !== 'none'
        ? params.reasoningEffort
        : undefined;
    const effort = requested === 'minimal' ? 'low' : (requested ?? 'high');
    return {
      thinking: { type: 'adaptive', display: 'summarized' as const },
      output_config: { effort },
    };
  }

  const budgetFromEffort = defaultAnthropicThinkingBudget(
    params.reasoningEffort && params.reasoningEffort !== 'none'
      ? params.reasoningEffort
      : undefined,
  );
  const requestedBudget =
    typeof params.reasoningTokens === 'number' && Number.isFinite(params.reasoningTokens)
      ? params.reasoningTokens
      : budgetFromEffort;
  const budget_tokens = Math.max(ANTHROPIC_MIN_THINKING_BUDGET, Math.floor(requestedBudget));
  return {
    thinking: { type: 'enabled', budget_tokens, display: 'summarized' as const },
  };
}

export function buildAnthropicBody(
  params: Pick<
    TransportChatParams,
    | 'model'
    | 'messages'
    | 'temperature'
    | 'topP'
    | 'maxTokens'
    | 'reasoningEffort'
    | 'reasoningTokens'
    | 'disableReasoning'
    | 'tools'
    | 'toolChoice'
    | 'plugins'
  > & {
    stream: boolean;
    enableAutomaticCaching?: boolean;
    /** Called with content kinds this API cannot carry, instead of dropping them silently. */
    onUnsupportedContent?: (kinds: UnsupportedContentKind[]) => void;
  },
): AnthropicMessagesRequest {
  // An id the alias map has not caught up with is still worth trying: the API
  // is the authority on what it serves, and refusing here means a newly
  // released model is unusable until this table is edited.
  const resolvedModel =
    resolveAnthropicDirectModelId(params.model) ?? normalizeAnthropicModelSlug(params.model);
  if (!resolvedModel) {
    throw new Error(`Unsupported Anthropic model: ${params.model}`);
  }

  const unsupported = new Set<UnsupportedContentKind>();
  const functionTools = mapToolDefinitions(params.tools) ?? [];
  // The Messages API refuses tool_use and tool_result blocks in a request that
  // defines no tools, so replayed tool rounds fold to their text then.
  const { system, messages } = convertMessages(
    functionTools.length > 0 ? params.messages : withoutToolHistory(params.messages),
    unsupported,
  );
  const body: AnthropicMessagesRequest = {
    model: resolvedModel,
    messages,
    max_tokens: params.maxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS,
    stream: params.stream,
  };

  if (
    params.enableAutomaticCaching &&
    supportsAnthropicPromptCaching(resolvedModel) &&
    countExplicitCacheBreakpoints({ system, messages }) < 4
  ) {
    body.cache_control = { type: 'ephemeral' };
  }

  if (typeof params.temperature === 'number') body.temperature = params.temperature;
  if (typeof params.topP === 'number') body.top_p = params.topP;
  if (system !== undefined) body.system = system;

  const tools: Array<AnthropicToolDefinition | AnthropicWebSearchToolDefinition> =
    functionTools.slice();
  if (hasWebPlugin(params.plugins)) {
    tools.push(ANTHROPIC_WEB_SEARCH_TOOL);
  }
  if (tools?.length) body.tools = tools;
  const toolChoice = mapToolChoice(params.toolChoice);
  if (toolChoice) body.tool_choice = toolChoice;

  const thinkingConfig = buildThinkingConfig({
    model: resolvedModel,
    reasoningEffort: params.reasoningEffort,
    reasoningTokens: params.reasoningTokens,
    disableReasoning: params.disableReasoning,
  });
  if ('thinking' in thinkingConfig && thinkingConfig.thinking) {
    body.thinking = thinkingConfig.thinking;
  }
  if ('output_config' in thinkingConfig && thinkingConfig.output_config) {
    body.output_config = thinkingConfig.output_config;
  }

  if (unsupported.size > 0) params.onUnsupportedContent?.(Array.from(unsupported));

  return body;
}
