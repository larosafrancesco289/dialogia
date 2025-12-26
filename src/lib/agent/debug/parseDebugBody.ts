export type DebugSummaryItem = { label: string; value: string };
export type DebugMessageDescriptor = {
  key: string;
  role: string;
  snippet: string;
  toolCalls?: string[];
};

export type DebugBodySnapshot = {
  summaryItems: DebugSummaryItem[];
  toolNames: string[];
  pluginNames: string[];
  messageItems: DebugMessageDescriptor[];
  rawJson: string;
};

type RecordLike = Record<string, unknown>;

const isRecord = (value: unknown): value is RecordLike =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const formatNumber = (value: unknown): string | undefined => {
  if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(2);
};

const coerceBooleanLabel = (
  value: unknown,
  trueLabel: string,
  falseLabel?: string,
): string | undefined => {
  if (value === true) return trueLabel;
  if (value === false && falseLabel) return falseLabel;
  return undefined;
};

const extractContentSnippet = (content: unknown): string => {
  if (!content) return '';
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (isRecord(part) && typeof part.text === 'string') return part.text;
        return '';
      })
      .filter(Boolean)
      .join(' ')
      .trim();
  }
  if (isRecord(content)) {
    if (typeof content.text === 'string') return content.text.trim();
    if (Array.isArray(content.content)) return extractContentSnippet(content.content);
  }
  return '';
};

const extractToolNames = (entries: unknown[]): string[] => {
  const names = entries
    .map((entry) => {
      if (!isRecord(entry)) return undefined;
      const fn = isRecord(entry.function) ? entry.function : undefined;
      if (fn && typeof fn.name === 'string') return fn.name;
      if (typeof entry.name === 'string') return entry.name;
      return undefined;
    })
    .filter((name): name is string => typeof name === 'string' && name.length > 0);
  return Array.from(new Set(names));
};

export function parseDebugBody(
  body?: string,
  options: { includeRawJson?: boolean } = {},
): DebugBodySnapshot | null {
  if (typeof body !== 'string' || body.trim().length === 0) return null;

  const includeRawJson = options.includeRawJson !== false;
  let parsed: RecordLike | null = null;

  try {
    const json = JSON.parse(body);
    parsed = isRecord(json) ? json : null;
  } catch {
    parsed = null;
  }

  const summaryItems: DebugSummaryItem[] = [];
  if (parsed) {
    if (typeof parsed.model === 'string' && parsed.model) {
      summaryItems.push({ label: 'Model', value: parsed.model });
    }
    const temperature = formatNumber(parsed.temperature);
    if (temperature) summaryItems.push({ label: 'Temperature', value: temperature });
    const topP = formatNumber(parsed.top_p);
    if (topP) summaryItems.push({ label: 'Top P', value: topP });
    const maxTokens = formatNumber(parsed.max_tokens);
    if (maxTokens) summaryItems.push({ label: 'Max tokens', value: maxTokens });
    if (isRecord(parsed.reasoning)) {
      const effort =
        typeof parsed.reasoning.effort === 'string' && parsed.reasoning.effort !== 'none'
          ? parsed.reasoning.effort
          : undefined;
      if (effort) summaryItems.push({ label: 'Reasoning effort', value: effort });
      const reasoningTokens = formatNumber(parsed.reasoning.max_tokens);
      if (reasoningTokens) {
        summaryItems.push({ label: 'Reasoning tokens', value: reasoningTokens });
      }
    }
    if (Array.isArray(parsed.tools) && parsed.tools.length) {
      summaryItems.push({ label: 'Tools', value: `${parsed.tools.length}` });
    }
    if (typeof parsed.stream === 'boolean') {
      summaryItems.push({ label: 'Streaming', value: parsed.stream ? 'On' : 'Off' });
    }
    const parallelLabel = coerceBooleanLabel(parsed.parallel_tool_calls, 'Enabled', 'Disabled');
    if (parallelLabel) {
      summaryItems.push({ label: 'Parallel tool calls', value: parallelLabel });
    }
    const usageRequested =
      isRecord(parsed.stream_options) && 'include_usage' in parsed.stream_options
        ? coerceBooleanLabel(parsed.stream_options.include_usage, 'Usage in stream')
        : undefined;
    if (usageRequested) {
      summaryItems.push({ label: 'Token usage', value: usageRequested });
    }
    if (Array.isArray(parsed.modalities) && parsed.modalities.length) {
      const list = parsed.modalities
        .filter((value): value is string => typeof value === 'string')
        .join(', ');
      if (list) summaryItems.push({ label: 'Modalities', value: list });
    }
    if (isRecord(parsed.provider)) {
      const sort = parsed.provider.sort;
      if (typeof sort === 'string') summaryItems.push({ label: 'Provider sort', value: sort });
    }
  }

  const toolNames = parsed && Array.isArray(parsed.tools) ? extractToolNames(parsed.tools) : [];

  const pluginNames =
    parsed && Array.isArray(parsed.plugins)
      ? parsed.plugins
          .map((plugin) =>
            isRecord(plugin) && typeof plugin.id === 'string' ? plugin.id : undefined,
          )
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      : [];

  const messageItems: DebugMessageDescriptor[] = [];
  if (parsed && Array.isArray(parsed.messages)) {
    parsed.messages.forEach((entry, index) => {
      if (!isRecord(entry)) return;
      const role =
        typeof entry.role === 'string' ? entry.role : `message ${index + 1}`;
      const snippet = extractContentSnippet(entry.content);
      const toolCallsNames =
        Array.isArray(entry.tool_calls) && entry.tool_calls.length
          ? extractToolNames(entry.tool_calls)
          : undefined;
      messageItems.push({
        key: `${index}-${role}`,
        role,
        snippet,
        ...(toolCallsNames && toolCallsNames.length ? { toolCalls: toolCallsNames } : {}),
      });
    });
  }

  const rawJson = includeRawJson
    ? parsed
      ? (() => {
          try {
            return JSON.stringify(parsed, null, 2);
          } catch {
            return body;
          }
        })()
      : body
    : '';

  return {
    summaryItems,
    toolNames,
    pluginNames,
    messageItems,
    rawJson,
  };
}
