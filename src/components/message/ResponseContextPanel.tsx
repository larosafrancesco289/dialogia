'use client';

import { useId, useMemo, useState } from 'react';
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

function toolDisplayName(name: string) {
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
function toolObject(item: ToolActivityItem) {
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

function toolAnnotation(item: ToolActivityItem): { text: string; live?: boolean; error?: boolean } {
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

function entryGlyph(item: ToolActivityItem) {
  if (item.name === 'web_search') return <MagnifyingGlassIcon className="h-full w-full" />;
  if (item.name.includes('fetch') || typeof item.input?.url === 'string') {
    return <GlobeAltIcon className="h-full w-full" />;
  }
  return <WrenchScrewdriverIcon className="h-full w-full" />;
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
  const toolItems = orderedActivity.filter(
    (item): item is ToolActivityItem => item.type === 'tool_call',
  );
  const visibleToolCount = toolItems.length;
  const hasToolCalls = visibleToolCount > 0;
  const hasActivity = orderedActivity.length > 0;

  const summary = (() => {
    const runningTool = sortedToolCalls.find((call) => call.status === 'pending');
    if (runningTool) return labelForTool(runningTool);
    const latestActivity = orderedActivity[orderedActivity.length - 1];
    if (latestActivity?.type === 'tool_call' && latestActivity.status === 'pending') {
      const object = toolObject(latestActivity);
      return `${toolDisplayName(latestActivity.name)}${object ? ` — ${object}` : ''}`;
    }
    if (isSearching) return sources?.query ? `Searching: ${sources.query}` : 'Searching sources';
    if (hasSearchError) return sources?.error || 'Search failed';
    if (isStreaming && latestActivity?.type === 'reasoning') {
      return compactText(latestActivity.text, 90);
    }
    if (hasActivity) {
      const thoughtCount = countActivity(orderedActivity, 'reasoning');
      const searchCount = toolItems.filter((item) => item.name === 'web_search').length;
      const toolNoun =
        visibleToolCount > 0 && searchCount === visibleToolCount
          ? `search${visibleToolCount === 1 ? '' : 'es'}`
          : `tool${visibleToolCount === 1 ? '' : 's'}`;
      const parts = [
        thoughtCount ? `${thoughtCount} thought${thoughtCount === 1 ? '' : 's'}` : '',
        visibleToolCount ? `${visibleToolCount} ${toolNoun}` : '',
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

  const copyReasoning = async () => {
    if (!hasReasoning) return;
    try {
      await navigator.clipboard.writeText(reasoning);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch (error) {
      logger.error('Failed to copy reasoning', error);
    }
  };

  const showSourcesEntry = hasSources || isSearching || hasSearchError;

  return (
    <section className="response-ledger">
      <div className="response-ledger__head">
        <button
          type="button"
          className="response-ledger__toggle"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={onToggle}
        >
          {isSearching || toolItems.some((item) => item.status === 'pending') ? (
            <MagnifyingGlassIcon className="response-ledger__glyph" />
          ) : (
            <LightBulbIcon className="response-ledger__glyph" />
          )}
          <span className="response-ledger__title">Reasoning</span>
          {summary && (
            <span className={`response-ledger__summary${isStreaming ? ' is-live' : ''}`}>
              {summary}
            </span>
          )}
          {hasSearchError && !expanded && (
            <span className="response-ledger__error">
              <ExclamationCircleIcon className="h-3.5 w-3.5" />
              Search failed
            </span>
          )}
          <span className="response-ledger__rule" aria-hidden="true" />
          <ChevronDownIcon className={`response-ledger__chevron${expanded ? ' is-open' : ''}`} />
        </button>
        {expanded && hasReasoning && (
          <button
            type="button"
            className={`response-ledger__copy${copied ? ' is-success' : ''}`}
            aria-label={copied ? 'Copied' : 'Copy reasoning'}
            title={copied ? 'Copied' : 'Copy reasoning'}
            onClick={copyReasoning}
          >
            {copied ? (
              <CheckIcon className="h-3.5 w-3.5" />
            ) : (
              <ClipboardDocumentIcon className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>

      {expanded && (
        <div className="panel-reveal">
          <div>
            <div id={bodyId} className="response-ledger__timeline">
              {orderedActivity.map((item) => {
                if (item.type === 'reasoning') {
                  return (
                    <div key={item.id} className="response-ledger__entry">
                      <span className="response-ledger__entry-glyph" aria-hidden="true">
                        <LightBulbIcon className="h-full w-full" />
                      </span>
                      <p className="response-ledger__thought">{item.text.trim()}</p>
                    </div>
                  );
                }
                if (item.type === 'text') {
                  return (
                    <div key={item.id} className="response-ledger__entry">
                      <span className="response-ledger__entry-glyph" aria-hidden="true" />
                      <p className="response-ledger__thought">{compactText(item.text, 180)}</p>
                    </div>
                  );
                }
                const annotation = toolAnnotation(item);
                const object = toolObject(item);
                return (
                  <div
                    key={item.id}
                    className="response-ledger__entry response-ledger__entry--tool"
                  >
                    <span className="response-ledger__entry-glyph" aria-hidden="true">
                      {entryGlyph(item)}
                    </span>
                    <span className="response-ledger__tool-line">
                      <span className="response-ledger__tool-name">
                        {toolDisplayName(item.name)}
                      </span>
                      {object && <span className="response-ledger__tool-object">{object}</span>}
                    </span>
                    <span
                      className={`response-ledger__annotation${annotation.error ? ' is-error' : ''}`}
                    >
                      {annotation.live && (
                        <span className="response-ledger__pulse" aria-hidden="true" />
                      )}
                      {annotation.text}
                    </span>
                  </div>
                );
              })}

              {!hasActivity && isStreaming && (
                <div className="response-ledger__entry">
                  <span className="response-ledger__entry-glyph" aria-hidden="true">
                    <LightBulbIcon className="h-full w-full" />
                  </span>
                  <p className="response-ledger__thought">
                    <span className="response-ledger__pulse" aria-hidden="true" /> Thinking...
                  </p>
                </div>
              )}

              {showSourcesEntry && (
                <div className="response-ledger__entry">
                  <span className="response-ledger__entry-glyph" aria-hidden="true">
                    <GlobeAltIcon className="h-full w-full" />
                  </span>
                  <button
                    type="button"
                    className="response-ledger__sources-toggle"
                    aria-expanded={sourcesOpen}
                    onClick={() => setSourcesOpen((value) => !value)}
                  >
                    {isSearching
                      ? `Looking for sources${sources?.query ? `: ${sources.query}` : ''}...`
                      : hasSearchError
                        ? sources?.error || 'Search could not return sources.'
                        : `Consulted ${sourceItems.length} source${sourceItems.length === 1 ? '' : 's'}`}
                    {hasSources && (
                      <ChevronDownIcon
                        className={`response-ledger__chevron${sourcesOpen ? ' is-open' : ''}`}
                      />
                    )}
                  </button>
                  {sourcesOpen && hasSources && (
                    <div className="panel-reveal response-ledger__sources-reveal">
                      <ol className="response-ledger__sources">
                        {sourceItems.map((source, index) => (
                          <li
                            key={`${source.url || source.title || 'source'}-${index}`}
                            className="response-ledger__source"
                          >
                            <span className="response-ledger__source-index">{index + 1}</span>
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noreferrer"
                              className="response-ledger__source-link"
                              title={source.description || titleForSource(source)}
                            >
                              {titleForSource(source)}
                            </a>
                            {source.url && (
                              <span className="response-ledger__source-host">
                                {hostname(source.url)}
                              </span>
                            )}
                            <ArrowTopRightOnSquareIcon className="h-3 w-3 shrink-0 text-[var(--color-fg-muted)]" />
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
