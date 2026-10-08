// Module: anthropic/request
// Responsibility: Build a Messages API request body from transport params: the
// model id, tools and tool choice, thinking and effort, and prompt caching.

import type { PluginConfig, ToolDefinition } from '@/lib/transport/contracts';
import type { TransportChatParams } from '@/lib/transport/types';
import { logger } from '@/lib/logger';
import { isRecord } from '@/lib/utils/guards';
import { withoutToolHistory } from '@/lib/transport/toolHistory';
import {
  ANTHROPIC_MIN_ANSWER_TOKENS,
  ANTHROPIC_MIN_THINKING_BUDGET,
  anthropicThinkingOff,
  anthropicWebSearchMode,
  defaultAnthropicMaxTokens,
  defaultAnthropicThinkingBudget,
  anthropicTakesOneSampler,
  documentedAnthropicDefaultEffort,
  isAnthropicSamplingFixed,
  normalizeAnthropicModelSlug,
  resolveAnthropicDirectModelId,
  supportsAnthropicAdaptiveThinking,
  supportsAnthropicPromptCaching,
  supportsAnthropicReasoning,
} from '@/lib/anthropic/shared';
import {
  convertMessages,
  pendingCodeContainer,
  type UnsupportedContentKind,
} from '@/lib/anthropic/messages';
import type {
  AnthropicMessageParam,
  AnthropicMessagesRequest,
  AnthropicTextBlock,
  AnthropicToolChoice,
  AnthropicToolDefinition,
  AnthropicWebSearchToolDefinition,
} from '@/lib/anthropic/wire';

const WEB_SEARCH_MAX_USES = 5;

/**
 * The web search tool this model takes (see `anthropicWebSearchMode`), or
 * undefined when it takes none. `response_inclusion` stays at its default,
 * "full": "excluded" would drop the results that code consumed from the
 * response, and with them the sources a reply lists, while the reply's
 * citations would still point at results the history no longer holds.
 */
function webSearchTool(model: string): AnthropicWebSearchToolDefinition | undefined {
  const mode = anthropicWebSearchMode(model);
  if (mode === 'none') return undefined;
  if (mode === 'basic') {
    return { type: 'web_search_20250305', name: 'web_search', max_uses: WEB_SEARCH_MAX_USES };
  }
  return {
    type: 'web_search_20260318',
    name: 'web_search',
    max_uses: WEB_SEARCH_MAX_USES,
    ...(mode === 'direct' ? { allowed_callers: ['direct'] as ['direct'] } : {}),
  };
}

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
  if (reasoningDisabled) {
    const off = anthropicThinkingOff(params.model);
    return off ? { thinking: off } : {};
  }

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
    const effort =
      requested === 'minimal'
        ? 'low'
        : (requested ?? documentedAnthropicDefaultEffort(params.model));
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

// Models that think when `thinking` is left out (Claude 5 on) fix sampling anyway.
const thinkingOn = (thinking: AnthropicMessagesRequest['thinking']) =>
  thinking?.type === 'enabled' || thinking?.type === 'adaptive';

/** top_p's range while thinking is on, on models that take it at all then. */
const THINKING_TOP_P_MIN = 0.95;

/**
 * The temperature and top_p a model accepts, of those asked for; anything
 * else is a 400 for the whole request, so it is left out. Models that fix
 * sampling take neither. Before them, thinking rules out temperature and
 * narrows top_p, and from Opus 4.1 only one of the two may be set.
 */
function samplingParams(
  model: string,
  temperature: number | undefined,
  topP: number | undefined,
  thinking: boolean,
): Pick<AnthropicMessagesRequest, 'temperature' | 'top_p'> {
  if (isAnthropicSamplingFixed(model)) return {};
  let t = typeof temperature === 'number' ? temperature : undefined;
  let p = typeof topP === 'number' ? topP : undefined;
  if (thinking) {
    t = undefined;
    if (p !== undefined && (p < THINKING_TOP_P_MIN || p > 1)) p = undefined;
  }
  if (t !== undefined && p !== undefined && anthropicTakesOneSampler(model)) p = undefined;
  return {
    ...(t !== undefined ? { temperature: t } : {}),
    ...(p !== undefined ? { top_p: p } : {}),
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
    max_tokens: params.maxTokens ?? defaultAnthropicMaxTokens(resolvedModel),
    stream: params.stream,
  };

  if (
    params.enableAutomaticCaching &&
    supportsAnthropicPromptCaching(resolvedModel) &&
    countExplicitCacheBreakpoints({ system, messages }) < 4
  ) {
    body.cache_control = { type: 'ephemeral' };
  }

  if (system !== undefined) body.system = system;

  const tools: Array<AnthropicToolDefinition | AnthropicWebSearchToolDefinition> =
    functionTools.slice();
  if (hasWebPlugin(params.plugins)) {
    const search = webSearchTool(resolvedModel);
    if (search) tools.push(search);
    else logger.warn(`[Anthropic] ${resolvedModel} takes no web search tool; searching is off`);
  }
  const container = functionTools.length > 0 ? pendingCodeContainer(params.messages) : undefined;
  if (container) body.container = container;
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
    // Budget thinking counts against max_tokens, and the API refuses a budget
    // that does not leave the answer room.
    if (body.thinking.type === 'enabled') {
      body.max_tokens = Math.max(
        body.max_tokens,
        body.thinking.budget_tokens + ANTHROPIC_MIN_ANSWER_TOKENS,
      );
    }
  }
  if ('output_config' in thinkingConfig && thinkingConfig.output_config) {
    body.output_config = thinkingConfig.output_config;
  }
  Object.assign(
    body,
    samplingParams(resolvedModel, params.temperature, params.topP, thinkingOn(body.thinking)),
  );

  if (unsupported.size > 0) params.onUnsupportedContent?.(Array.from(unsupported));

  return body;
}

/** The body chat and stream send: every transport param, with automatic caching on. */
export function bodyFromParams(
  params: TransportChatParams,
  stream: boolean,
): AnthropicMessagesRequest {
  return buildAnthropicBody({
    model: params.model,
    messages: params.messages,
    stream,
    temperature: params.temperature,
    topP: params.topP,
    maxTokens: params.maxTokens,
    reasoningEffort: params.reasoningEffort,
    reasoningTokens: params.reasoningTokens,
    disableReasoning: params.disableReasoning,
    tools: params.tools,
    toolChoice: params.toolChoice,
    plugins: params.plugins,
    enableAutomaticCaching: true,
    onUnsupportedContent: (kinds) =>
      logger.warn(`[Anthropic] Dropped unsupported content: ${kinds.join(', ')}`),
  });
}
