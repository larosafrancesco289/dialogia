'use client';

import { useId, useMemo, useState, type MouseEvent } from 'react';
import {
  ArrowTopRightOnSquareIcon,
  CheckIcon,
  ChevronDownIcon,
  ClipboardDocumentIcon,
  ExclamationCircleIcon,
  GlobeAltIcon,
  LightBulbIcon,
  MagnifyingGlassIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline';
import { logger } from '@/lib/logger';
import type { MessageActivityItem, ToolCallLogEntry } from '@/lib/types';

export type SearchSourcesData = {
  query: string;
  status: 'loading' | 'done' | 'error';
  results?: { title?: string; url?: string; description?: string }[];
  error?: string;
};

type ResponseContextPanelProps = {
  reasoning: string;
  toolCalls?: ToolCallLogEntry[];
  activity?: MessageActivityItem[];
  sources?: SearchSourcesData;
  expanded: boolean;
  onToggle: () => void;
  isStreaming?: boolean;
  provider?: 'Tavily' | 'OpenRouter';
};

type ToolActivityItem = Extract<MessageActivityItem, { type: 'tool_call' }>;

function compactText(value: string, max = 140) {
  const text = value.trim().replace(/\s+/g, ' ');
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(' ');
  return `${slice.slice(0, lastSpace > 90 ? lastSpace : max)}...`;
}

function countActivity(activity: MessageActivityItem[], type: MessageActivityItem['type']) {
  return activity.filter((item) => item.type === type).length;
}

function hostname(url?: string) {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function titleForSource(source: { title?: string; url?: string }) {
  return source.title || hostname(source.url) || source.url || 'Untitled source';
}

function labelForTool(call: ToolCallLogEntry) {
  if (call.name === 'web_search') return 'Searching the web';
  return call.name.replace(/_/g, ' ');
}

function labelForActivityTool(item: ToolActivityItem) {
  if (item.name === 'web_search') return 'Calling web search';
  return `Calling ${item.name.replace(/_/g, ' ')}`;
}

function summaryForActivityTool(item: ToolActivityItem) {
  const output = item.output;
  const input = item.input;
  if (item.name === 'web_search') {
    const query =
      typeof input?.query === 'string'
        ? input.query
        : typeof output?.query === 'string'
          ? output.query
          : '';
    const results =
      typeof item.metadata?.results === 'number'
        ? item.metadata.results
        : Array.isArray(output?.resultsPreview)
          ? output.resultsPreview.length
          : undefined;
    if (item.status === 'pending') return query || 'Choosing search terms';
    if (item.status === 'error') return item.error || 'Search failed';
    return `${results ?? 0} result${results === 1 ? '' : 's'}${query ? `, ${query}` : ''}`;
  }
  if (item.status === 'pending') return 'Running';
  if (item.status === 'error') return item.error || 'Failed';
  if (typeof item.metadata?.notes === 'string') return item.metadata.notes;
  return 'Done';
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

export function ResponseContextPanel({
  reasoning,
  toolCalls = [],
  activity = [],
  sources,
  expanded,
  onToggle,
  isStreaming = false,
}: ResponseContextPanelProps) {
  const bodyId = useId();
  const [copied, setCopied] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const hasReasoning = reasoning.trim().length > 0;
  const sortedToolCalls = useMemo(
    () => [...toolCalls].sort((a, b) => a.timestamp - b.timestamp),
    [toolCalls],
  );
  const sourceItems = sources?.results ?? [];
  const hasSources = sourceItems.length > 0;
  const isSearching = sources?.status === 'loading';
  const hasSearchError = sources?.status === 'error';
  const orderedActivity = useMemo(
    () =>
      buildOrderedResponseActivity({ activity, reasoning, toolCalls: sortedToolCalls, sources }),
    [activity, reasoning, sortedToolCalls, sources],
  );
  const visibleToolCount = countActivity(orderedActivity, 'tool_call');
  const hasToolCalls = visibleToolCount > 0;
  const hasActivity = orderedActivity.length > 0;

  const summary = (() => {
    const runningTool = sortedToolCalls.find((call) => call.status === 'pending');
    if (runningTool) return labelForTool(runningTool);
    const latestActivity = orderedActivity[orderedActivity.length - 1];
    if (latestActivity?.type === 'tool_call' && latestActivity.status === 'pending') {
      return labelForActivityTool(latestActivity);
    }
    if (isSearching) return sources?.query ? `Searching: ${sources.query}` : 'Searching sources';
    if (hasSearchError) return sources?.error || 'Search failed';
    if (hasActivity) {
      const thoughtCount = countActivity(orderedActivity, 'reasoning');
      const toolCount = countActivity(orderedActivity, 'tool_call');
      const parts = [
        thoughtCount ? `${thoughtCount} thought${thoughtCount === 1 ? '' : 's'}` : '',
        toolCount ? `${toolCount} tool${toolCount === 1 ? '' : 's'}` : '',
      ].filter(Boolean);
      return parts.join(', ');
    }
    if (hasToolCalls) return visibleToolCount === 1 ? '1 tool' : `${visibleToolCount} tools`;
    if (hasReasoning) return compactText(reasoning);
    if (isStreaming) return 'Thinking...';
    return '';
  })();

  if (
    !hasReasoning &&
    !hasToolCalls &&
    !hasActivity &&
    !hasSources &&
    !isSearching &&
    !hasSearchError &&
    !isStreaming
  )
    return null;

  const copyReasoning = async (event: MouseEvent) => {
    event.stopPropagation();
    if (!hasReasoning) return;
    try {
      await navigator.clipboard.writeText(reasoning);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch (error) {
      logger.error('Failed to copy reasoning', error);
    }
  };

  return (
    <section className="mx-4 mt-3 mb-2 overflow-hidden rounded-[var(--radius-editorial)] border border-[var(--color-border)] bg-[var(--marginalia-bg)] text-[var(--color-fg)]">
      <button
        type="button"
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-[var(--color-surface)]"
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={onToggle}
      >
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--color-surface)] text-[var(--color-accent)]">
          {isSearching ||
          sortedToolCalls.some(
            (call) => call.name === 'web_search' && call.status === 'pending',
          ) ? (
            <MagnifyingGlassIcon className="h-4 w-4" />
          ) : (
            <LightBulbIcon className="h-4 w-4" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold tracking-[0.08em] text-[var(--color-fg-muted)]">
              Reasoning
            </span>
            {hasToolCalls && (
              <span className="text-[11px] font-medium text-[var(--color-fg-muted)]">
                {visibleToolCount} tool{visibleToolCount === 1 ? '' : 's'}
              </span>
            )}
            {hasSearchError && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-danger)]">
                <ExclamationCircleIcon className="h-3.5 w-3.5" />
                Search failed
              </span>
            )}
          </span>
          {summary && (
            <span className="mt-0.5 block truncate text-sm text-[var(--color-fg-muted)]">
              {summary}
            </span>
          )}
        </span>
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-[var(--color-fg-muted)] transition-transform duration-200 ${
            expanded ? 'rotate-180' : ''
          }`}
        />
      </button>

      {expanded && (
        <div id={bodyId} className="border-t border-[var(--rule-light)] px-3 pb-2.5 pt-2">
          <div className="space-y-1.5">
            {orderedActivity.map((item) => {
              if (item.type === 'reasoning') {
                return (
                  <div
                    key={item.id}
                    className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-2 text-sm"
                  >
                    <span className="mt-1 grid h-5 w-5 place-items-center rounded-full bg-[var(--color-surface)] text-[var(--color-fg-muted)]">
                      <LightBulbIcon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 rounded-[var(--radius-editorial)] px-2 py-1.5 hover:bg-[var(--color-surface)]">
                      <div className="flex items-start gap-2">
                        <span className="shrink-0 text-xs font-semibold tracking-[0.08em] text-[var(--color-fg-muted)]">
                          Thought
                        </span>
                        <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm leading-snug text-[var(--color-fg)]">
                          {item.text.trim()}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }
              if (item.type === 'text') {
                return (
                  <div
                    key={item.id}
                    className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-2 text-sm"
                  >
                    <span className="mt-1 h-5 w-5 rounded-full bg-[var(--color-surface)]" />
                    <div className="min-w-0 rounded-[var(--radius-editorial)] px-2 py-1.5 hover:bg-[var(--color-surface)]">
                      <span className="mr-2 text-xs font-semibold tracking-[0.08em] text-[var(--color-fg-muted)]">
                        Draft
                      </span>
                      <span className="text-sm text-[var(--color-fg-muted)]">
                        {compactText(item.text, 180)}
                      </span>
                    </div>
                  </div>
                );
              }
              return (
                <div
                  key={item.id}
                  className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-2 text-sm"
                >
                  <span className="mt-1 grid h-5 w-5 place-items-center rounded-full bg-[var(--color-surface)] text-[var(--color-fg-muted)]">
                    {item.name === 'web_search' ? (
                      <MagnifyingGlassIcon className="h-3.5 w-3.5" />
                    ) : (
                      <WrenchScrewdriverIcon className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <div className="min-w-0 rounded-[var(--radius-editorial)] px-2 py-1.5 hover:bg-[var(--color-surface)]">
                    <div className="flex min-w-0 items-baseline gap-2">
                      <span className="shrink-0 text-xs font-semibold tracking-[0.08em] text-[var(--color-fg-muted)]">
                        Tool
                      </span>
                      <span className="shrink-0 font-medium text-[var(--color-fg)]">
                        {labelForActivityTool(item)}
                      </span>
                      <span className="min-w-0 truncate text-[var(--color-fg-muted)]">
                        {summaryForActivityTool(item)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {!hasReasoning && !hasToolCalls && !hasActivity && isStreaming && (
              <div className="flex items-center gap-2 text-sm text-[var(--color-fg-muted)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
                Thinking...
              </div>
            )}
          </div>

          <div className="mt-2 flex items-center justify-between gap-2 border-t border-[var(--rule-light)] pt-2">
            <div className="flex min-w-0 items-center gap-2">
              {(hasSources || isSearching || hasSearchError) && (
                <button
                  type="button"
                  className="inline-flex h-7 items-center gap-1.5 rounded-[var(--radius-editorial)] px-2 text-xs font-medium text-[var(--color-fg-muted)] hover:bg-[var(--color-muted)]"
                  onClick={() => setSourcesOpen((value) => !value)}
                >
                  <GlobeAltIcon className="h-3.5 w-3.5" />
                  Sources
                  {hasSources ? ` ${sourceItems.length}` : ''}
                </button>
              )}
            </div>
            {hasReasoning && (
              <button
                type="button"
                className="inline-flex h-7 items-center gap-1.5 rounded-[var(--radius-editorial)] px-2 text-xs font-medium text-[var(--color-fg-muted)] hover:bg-[var(--color-muted)]"
                onClick={copyReasoning}
              >
                {copied ? (
                  <>
                    <CheckIcon className="h-3.5 w-3.5" />
                    Copied
                  </>
                ) : (
                  <>
                    <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                    Copy
                  </>
                )}
              </button>
            )}
          </div>

          {sourcesOpen && (hasSources || isSearching || hasSearchError) && (
            <div className="mt-2 rounded-[var(--radius-editorial)] bg-[var(--color-surface)] px-2.5 py-2">
              {isSearching && (
                <div className="text-sm text-[var(--color-fg-muted)]">
                  Looking for sources{sources?.query ? `: ${sources.query}` : ''}.
                </div>
              )}

              {hasSearchError && (
                <div className="text-sm text-[var(--color-danger)]">
                  {sources?.error || 'Search could not return sources.'}
                </div>
              )}

              {hasSources && (
                <ol className="space-y-1">
                  {sourceItems.map((source, index) => (
                    <li
                      key={`${source.url || source.title || 'source'}-${index}`}
                      className="flex items-center gap-2 text-sm"
                    >
                      <span className="shrink-0 text-xs font-semibold text-[var(--color-fg-muted)]">
                        [{index + 1}]
                      </span>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="min-w-0 flex-1 truncate font-medium text-[var(--color-fg)] hover:text-[var(--color-accent)]"
                        title={source.description || titleForSource(source)}
                      >
                        {titleForSource(source)}
                      </a>
                      {source.url && (
                        <span className="hidden max-w-[11rem] truncate text-xs text-[var(--color-fg-muted)] sm:inline">
                          {hostname(source.url)}
                        </span>
                      )}
                      <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5 shrink-0 text-[var(--color-fg-muted)]" />
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
