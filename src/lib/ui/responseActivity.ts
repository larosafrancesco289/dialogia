// Module: ui/responseActivity
// Responsibility: What the reply's reasoning ledger says: the ordered timeline of
// thoughts and tool calls (folding in legacy reasoning, tool logs and search
// sources), the one-line summary in its head, and each tool call's labels.

import type { MessageActivityItem, ToolCallLogEntry } from '@/lib/types';

export type SearchSourcesData = {
  query: string;
  status: 'loading' | 'done' | 'error';
  results?: { title?: string; url?: string; description?: string }[];
  error?: string;
};

export type ToolActivityItem = Extract<MessageActivityItem, { type: 'tool_call' }>;

export function compactText(value: string, max = 140) {
  const text = value.trim().replace(/\s+/g, ' ');
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(' ');
  return `${slice.slice(0, lastSpace > 90 ? lastSpace : max)}…`;
}

/** Markdown emphasis and code marks, which the one-line summary shows bare. */
function plainText(value: string) {
  return value.replace(/\*\*|__|`/g, '').replace(/^#+\s*/gm, '');
}

/**
 * The line the model is on while it thinks: its latest heading, when its
 * reasoning arrives in titled sections, or else its latest finished sentence.
 * A sentence counts once whitespace follows it, so the line changes once per
 * sentence instead of once per token. Empty until there is a whole one.
 */
export function currentThoughtLine(text: string): string {
  const headings = [...text.matchAll(/^[ \t]*\*\*([^*\n]+)\*\*[ \t]*$/gm)];
  const heading = headings[headings.length - 1]?.[1]?.trim();
  if (heading) return compactText(plainText(heading), 110);
  const sentences = plainText(text).match(/[^.!?\n]+[.!?]+(?=\s)/g);
  const last = sentences?.[sentences.length - 1]?.trim();
  return last ? compactText(last, 110) : '';
}

/** How long the model thought, in words: "9 seconds", "1 minute 12 seconds". */
export function formatThinkingTime(ms: number): string {
  const total = Math.max(1, Math.round(ms / 1000));
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (total < 60) return unit(total, 'second');
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return seconds
    ? `${unit(minutes, 'minute')} ${unit(seconds, 'second')}`
    : unit(minutes, 'minute');
}

/**
 * What the model's thinking came to, at rest: how long it took when that was
 * timed, otherwise how many words it ran to.
 */
function thinkingMeasure(activity: MessageActivityItem[], reasoning: string): string {
  const thoughts = activity.filter(
    (item): item is Extract<MessageActivityItem, { type: 'reasoning' }> =>
      item.type === 'reasoning',
  );
  const timed = thoughts.filter((item) => typeof item.duration === 'number');
  if (timed.length > 0) {
    // Read after the ledger's "Thought" label: "Thought for 8 seconds".
    return `for ${formatThinkingTime(timed.reduce((sum, item) => sum + (item.duration ?? 0), 0))}`;
  }
  const text = thoughts.length > 0 ? thoughts.map((item) => item.text).join(' ') : reasoning;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return words ? `${words} word${words === 1 ? '' : 's'}` : '';
}

export function hostname(url?: string) {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function titleForSource(source: { title?: string; url?: string }) {
  return source.title || hostname(source.url) || source.url || 'Untitled source';
}

function labelForTool(call: ToolCallLogEntry) {
  if (call.name === 'web_search') return 'Searching the web';
  return call.name.replace(/_/g, ' ');
}

export function toolDisplayName(name: string) {
  const text = name.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function toolQuery(item: ToolActivityItem) {
  const input = item.input;
  const output = item.output;
  if (typeof input?.query === 'string') return input.query;
  if (typeof output?.query === 'string') return output.query;
  return '';
}

/** The object of the tool call — what was searched for or fetched. */
export function toolObject(item: ToolActivityItem) {
  const query = toolQuery(item);
  if (query) return `‘${query}’`;
  if (typeof item.input?.url === 'string') return hostname(item.input.url);
  return '';
}

function formatDuration(duration?: number) {
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) return '';
  return duration >= 1000 ? `${(duration / 1000).toFixed(1)}s` : `${Math.round(duration)}ms`;
}

function toolResultCount(item: ToolActivityItem) {
  if (typeof item.metadata?.results === 'number') return item.metadata.results;
  if (Array.isArray(item.output?.resultsPreview)) return item.output.resultsPreview.length;
  return undefined;
}

export function toolAnnotation(item: ToolActivityItem): {
  text: string;
  live?: boolean;
  error?: boolean;
} {
  if (item.status === 'pending') {
    return { text: item.name === 'web_search' ? 'Searching' : 'Running', live: true };
  }
  if (item.status === 'error') {
    return { text: item.error || 'Failed', error: true };
  }
  if (item.name === 'web_search') {
    const results = toolResultCount(item);
    return { text: `${results ?? 0} result${results === 1 ? '' : 's'}` };
  }
  if (typeof item.metadata?.notes === 'string') return { text: item.metadata.notes };
  return { text: formatDuration(item.duration) || 'Done' };
}

function activityFromToolCall(call: ToolCallLogEntry): ToolActivityItem {
  return {
    id: call.id,
    type: 'tool_call',
    name: call.name,
    timestamp: call.timestamp,
    status: call.status,
    input: call.input,
    output: call.output,
    error: call.error,
    duration: call.duration,
    category: call.category,
    metadata: call.metadata,
    round: typeof call.metadata?.round === 'number' ? call.metadata.round : undefined,
  };
}

function activityFromSources(sources?: SearchSourcesData): ToolActivityItem | undefined {
  if (!sources) return undefined;
  const results = sources.results ?? [];
  return {
    id: 'tavily-source-tool',
    type: 'tool_call',
    name: 'web_search',
    timestamp: Number.MAX_SAFE_INTEGER,
    status:
      sources.status === 'loading' ? 'pending' : sources.status === 'error' ? 'error' : 'success',
    input: sources.query ? { query: sources.query } : undefined,
    output: { query: sources.query, resultsPreview: results.slice(0, 3) },
    error: sources.error,
    category: 'search',
    metadata: { provider: 'tavily', results: results.length },
  };
}

export function buildOrderedResponseActivity({
  activity,
  reasoning,
  toolCalls,
  sources,
}: {
  activity?: MessageActivityItem[];
  reasoning: string;
  toolCalls?: ToolCallLogEntry[];
  sources?: SearchSourcesData;
}): MessageActivityItem[] {
  const hasReasoning = reasoning.trim().length > 0;
  const sortedToolCalls = [...(toolCalls ?? [])].sort((a, b) => a.timestamp - b.timestamp);
  const items =
    activity && activity.length > 0
      ? [...activity]
      : hasReasoning
        ? [
            {
              id: 'legacy-reasoning',
              type: 'reasoning' as const,
              text: reasoning,
              timestamp: 0,
              status: 'done' as const,
            },
          ]
        : [];
  const existingToolIds = new Set(
    items.filter((item) => item.type === 'tool_call').map((item) => item.id),
  );
  for (const call of sortedToolCalls) {
    if (!existingToolIds.has(call.id)) {
      items.push(activityFromToolCall(call));
      existingToolIds.add(call.id);
    }
  }
  const hasVisibleSearchTool = items.some(
    (item) => item.type === 'tool_call' && item.name === 'web_search',
  );
  const sourceActivity = activityFromSources(sources);
  if (sourceActivity && !hasVisibleSearchTool) {
    items.push(sourceActivity);
  }
  return items.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * The ledger's one-line summary: what is running now, the live line of
 * thought, or at rest how long the model thought and how many tools it used.
 * `toolCalls` must be sorted by time; `isLive` is whether the model is still
 * at work on this reply.
 */
export function summarizeActivity({
  orderedActivity,
  toolCalls,
  reasoning,
  sources,
  isLive,
}: {
  orderedActivity: MessageActivityItem[];
  toolCalls: ToolCallLogEntry[];
  reasoning: string;
  sources?: SearchSourcesData;
  isLive: boolean;
}): string {
  const latestActivity = orderedActivity[orderedActivity.length - 1];
  const toolItems = orderedActivity.filter(
    (item): item is ToolActivityItem => item.type === 'tool_call',
  );
  const visibleToolCount = toolItems.length;
  const isSearching = sources?.status === 'loading';
  const hasSearchError = sources?.status === 'error';

  const runningTool = toolCalls.find((call) => call.status === 'pending');
  if (runningTool) return labelForTool(runningTool);
  if (latestActivity?.type === 'tool_call' && latestActivity.status === 'pending') {
    const object = toolObject(latestActivity);
    return `${toolDisplayName(latestActivity.name)}${object ? ` — ${object}` : ''}`;
  }
  if (isSearching) return sources?.query ? `Searching: ${sources.query}` : 'Searching sources';
  if (hasSearchError) return sources?.error || 'Search failed';
  if (isLive) {
    const thought = latestActivity?.type === 'reasoning' ? latestActivity.text : reasoning;
    return currentThoughtLine(thought) || 'Thinking…';
  }
  if (orderedActivity.length > 0) {
    const searchCount = toolItems.filter((item) => item.name === 'web_search').length;
    const toolNoun =
      visibleToolCount > 0 && searchCount === visibleToolCount
        ? `search${visibleToolCount === 1 ? '' : 'es'}`
        : `tool${visibleToolCount === 1 ? '' : 's'}`;
    const parts = [
      thinkingMeasure(orderedActivity, reasoning),
      visibleToolCount ? `${visibleToolCount} ${toolNoun}` : '',
    ].filter(Boolean);
    return parts.join(', ');
  }
  if (visibleToolCount > 0) return visibleToolCount === 1 ? '1 tool' : `${visibleToolCount} tools`;
  if (reasoning.trim().length > 0) return thinkingMeasure([], reasoning);
  return '';
}
