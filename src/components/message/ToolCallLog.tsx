import { useMemo, useState } from 'react';
import {
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DocumentDuplicateIcon,
} from '@heroicons/react/20/solid';
import type { LearnerModelDebugSnapshot, ToolCallLogEntry } from '@/lib/types';

type ToolCallLogMode = 'compact' | 'full';
type ToolCallBadge = { id: string; label: string };

export type ToolCallLogProps = {
  toolCalls: ToolCallLogEntry[];
  mode?: ToolCallLogMode;
  showTimestamps?: boolean;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  highlightRecent?: boolean;
  onToolClick?: (toolCall: ToolCallLogEntry) => void;
  className?: string;
};

function formatTimestamp(timestamp: number) {
  try {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '';
  }
}

function formatDuration(duration?: number) {
  if (typeof duration !== 'number' || Number.isNaN(duration) || duration <= 0) {
    return '';
  }
  if (duration < 1000) return `${Math.round(duration)}ms`;
  return `${(duration / 1000).toFixed(2)}s`;
}

function formatMetadataValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

const CATEGORY_LABEL: Record<NonNullable<ToolCallLogEntry['category']>, string> = {
  search: 'Search',
  tutor: 'Tutor',
  planning: 'Planning',
  system: 'System',
  other: 'Other',
};

const PROVIDER_LABEL: Record<string, string> = {
  tavily: 'Tavily',
  openrouter: 'OpenRouter',
};

function summaryForCall(call: ToolCallLogEntry): string {
  switch (call.name) {
    case 'assess_answer': {
      const output = call.output;
      const evidence = output?.learnerModelDebug ?? output?.assessment;
      let result: string | undefined;
      if (evidence && typeof evidence === 'object' && !Array.isArray(evidence)) {
        const maybe = evidence as Record<string, unknown>;
        if (typeof maybe.correct === 'boolean') {
          result = maybe.correct ? 'correct' : 'incorrect';
        } else if (typeof maybe.result === 'string') {
          result = maybe.result;
        }
      }
      return `Assessed: ${result ?? 'n/a'}`;
    }
    case 'update_learner_model': {
      const debug = (call.output as { learnerModelDebug?: LearnerModelDebugSnapshot } | undefined)
        ?.learnerModelDebug;
      if (
        debug &&
        typeof debug.oldConfidence === 'number' &&
        typeof debug.newConfidence === 'number'
      ) {
        const prev = Math.round(debug.oldConfidence * 100);
        const next = Math.round(debug.newConfidence * 100);
        const delta = next - prev;
        const sign = delta >= 0 ? '+' : '';
        return `Confidence ${prev}% → ${next}% (${sign}${delta}%)`;
      }
      return 'Learner model updated';
    }
    case 'generate_plan': {
      const nodes = call.output?.nodes;
      const nodeCount = Array.isArray(nodes) ? nodes.length : undefined;
      return typeof nodeCount === 'number'
        ? `Generated plan with ${nodeCount} steps`
        : 'Generated plan';
    }
    case 'create_diagnostic': {
      const topicValue = call.output?.topic;
      const topic = typeof topicValue === 'string' ? topicValue : undefined;
      return typeof topic === 'string' && topic ? `Diagnostic for ${topic}` : 'Diagnostic created';
    }
    case 'web_search': {
      const output = call.output;
      const ok = typeof output?.ok === 'boolean' ? output.ok : undefined;
      const resultsPreview = output?.resultsPreview;
      const resultsCount = Array.isArray(resultsPreview) ? resultsPreview.length : undefined;
      if (ok === true) return `Web search (${resultsCount ?? 0} results)`;
      if (ok === false) return 'Web search error';
      return 'Web search';
    }
    default:
      return call.status === 'success' ? 'Completed' : call.status;
  }
}

function statusIcon(status: ToolCallLogEntry['status']) {
  if (status === 'success') {
    return <CheckCircleIcon className="h-4 w-4" style={{ color: 'var(--color-success)' }} />;
  }
  if (status === 'error') {
    return <XCircleIcon className="h-4 w-4" style={{ color: 'var(--color-danger)' }} />;
  }
  return <ClockIcon className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />;
}

function stringify(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function collectBadges(call: ToolCallLogEntry): ToolCallBadge[] {
  const badges: ToolCallBadge[] = [];
  if (call.category && CATEGORY_LABEL[call.category]) {
    badges.push({ id: `category-${call.category}`, label: CATEGORY_LABEL[call.category] });
  }
  const meta = call.metadata;
  if (meta) {
    if (typeof meta.provider === 'string') {
      const key = meta.provider.toLowerCase();
      badges.push({
        id: `provider-${meta.provider}`,
        label: PROVIDER_LABEL[key] || meta.provider,
      });
    }
    if (typeof meta.round === 'number' && Number.isFinite(meta.round)) {
      badges.push({ id: `round-${meta.round}`, label: `Round ${meta.round}` });
    }
    if (meta.cached === true) {
      badges.push({ id: 'cached', label: 'Cached result' });
    }
    if (typeof meta.modelUsed === 'string' && meta.modelUsed) {
      badges.push({ id: `model-${meta.modelUsed}`, label: meta.modelUsed });
    }
    if (meta.usedContent === true) {
      badges.push({ id: 'used-content', label: 'Used in reply' });
    }
    if (meta.modelUpdated === true) {
      badges.push({ id: 'model-updated', label: 'Learner model updated' });
    }
    if (meta.planUpdated === true) {
      badges.push({ id: 'plan-updated', label: 'Plan updated' });
    }
  }
  return badges;
}

function metadataEntries(metadata: ToolCallLogEntry['metadata']): Array<[string, string]> {
  if (!metadata) return [];
  const entries: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(metadata)) {
    const formatted = formatMetadataValue(value);
    if (!formatted) continue;
    entries.push([key, formatted]);
  }
  return entries;
}

function copyToClipboard(text: string) {
  if (typeof navigator === 'undefined') return;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      void navigator.clipboard.writeText(text);
    }
  } catch {
    // ignore copy failures
  }
}

export function ToolCallLog({
  toolCalls,
  mode = 'compact',
  showTimestamps = true,
  collapsible = true,
  defaultExpanded = false,
  highlightRecent = false,
  onToolClick,
  className,
}: ToolCallLogProps) {
  const [expanded, setExpanded] = useState(defaultExpanded || mode === 'full');
  const [expandedCalls, setExpandedCalls] = useState<Record<string, boolean>>({});

  const sortedCalls = useMemo(() => {
    return [...toolCalls].sort((a, b) => a.timestamp - b.timestamp);
  }, [toolCalls]);

  if (!sortedCalls.length) return null;

  const toggleCall = (id: string) => setExpandedCalls((prev) => ({ ...prev, [id]: !prev[id] }));

  const containerClassName = [
    'border border-[var(--color-border)] rounded-[var(--radius-editorial)] overflow-hidden bg-[var(--color-muted)]/30 my-2',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={containerClassName}>
      <div
        className={`flex items-center justify-between px-3 py-2 bg-[var(--color-muted)]/50 ${
          collapsible ? 'cursor-pointer' : ''
        }`}
        onClick={() => {
          if (!collapsible) return;
          setExpanded((prev) => !prev);
        }}
      >
        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-fg-muted)] uppercase tracking-wider">
          <span>Tool Calls ({sortedCalls.length})</span>
        </div>
        {collapsible && (
          <span className="text-[var(--color-fg-muted)]">
            {expanded ? (
              <ChevronUpIcon className="h-4 w-4" />
            ) : (
              <ChevronDownIcon className="h-4 w-4" />
            )}
          </span>
        )}
      </div>
      {expanded && (
        <div className="divide-y divide-[var(--color-border)]">
          {sortedCalls.map((call) => {
            const isExpanded = mode === 'full' || !!expandedCalls[call.id];
            const recentHighlight =
              highlightRecent && Date.now() - call.timestamp < 10_000
                ? 'bg-[var(--color-accent)]/5'
                : '';
            const durationLabel = formatDuration(call.duration);
            const badges = collectBadges(call);
            const metadataPairs = metadataEntries(call.metadata);
            return (
              <div key={call.id} className={`bg-[var(--color-surface)] ${recentHighlight}`}>
                <button
                  type="button"
                  onClick={() => {
                    if (!onToolClick) {
                      toggleCall(call.id);
                    } else {
                      onToolClick(call);
                    }
                  }}
                  className="w-full text-left px-3 py-2 flex items-center justify-between gap-3 hover:bg-[var(--color-muted)]/40 focus:outline-none"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {statusIcon(call.status)}
                    {showTimestamps && (
                      <span className="text-[11px] text-[var(--color-fg-muted)] font-mono">
                        {formatTimestamp(call.timestamp)}
                      </span>
                    )}
                    <span className="text-sm font-medium text-[var(--color-fg)] truncate">
                      {call.name}
                    </span>
                    <span className="text-xs text-[var(--color-fg-muted)] truncate">
                      {summaryForCall(call)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {badges.length > 0 && (
                      <span className="flex flex-wrap items-center justify-end gap-1">
                        {badges.map((badge) => (
                          <span
                            key={badge.id}
                            className="inline-flex items-center rounded-full bg-[var(--color-muted)] border border-[var(--color-border)]/50 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-fg-muted)] uppercase tracking-wider"
                          >
                            {badge.label}
                          </span>
                        ))}
                      </span>
                    )}
                    {durationLabel && (
                      <span className="text-[11px] text-[var(--color-fg-muted)] font-mono">
                        {durationLabel}
                      </span>
                    )}
                    {mode !== 'full' && (
                      <span className="text-[var(--color-fg-muted)]">
                        {isExpanded ? (
                          <ChevronUpIcon className="h-3 w-3" />
                        ) : (
                          <ChevronDownIcon className="h-3 w-3" />
                        )}
                      </span>
                    )}
                  </div>
                </button>
                {isExpanded && (
                  <div className="px-3 pb-3 space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-semibold text-[var(--color-accent)] uppercase tracking-wider">
                          Input
                        </span>
                        <button
                          type="button"
                          className="p-1 rounded-[var(--radius-editorial)] hover:bg-[var(--color-muted)]"
                          onClick={() => copyToClipboard(stringify(call.input))}
                          aria-label="Copy input JSON"
                        >
                          <DocumentDuplicateIcon className="h-3.5 w-3.5 text-[var(--color-fg-muted)]" />
                        </button>
                      </div>
                      <pre className="text-xs bg-[var(--color-muted)]/30 rounded-[var(--radius-editorial)] p-2 overflow-x-auto border border-[var(--color-border)]/30 font-mono">
                        <code>{stringify(call.input)}</code>
                      </pre>
                    </div>

                    {call.output && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] font-semibold text-[var(--color-accent)] uppercase tracking-wider">
                            Output
                          </span>
                          <button
                            type="button"
                            className="p-1 rounded-[var(--radius-editorial)] hover:bg-[var(--color-muted)]"
                            onClick={() => copyToClipboard(stringify(call.output))}
                            aria-label="Copy output JSON"
                          >
                            <DocumentDuplicateIcon className="h-3.5 w-3.5 text-[var(--color-fg-muted)]" />
                          </button>
                        </div>
                        <pre className="text-xs bg-[var(--color-muted)]/30 rounded-[var(--radius-editorial)] p-2 overflow-x-auto border border-[var(--color-border)]/30 font-mono">
                          <code>{stringify(call.output)}</code>
                        </pre>
                      </div>
                    )}

                    {call.error && (
                      <div className="text-xs text-[var(--color-danger)] bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/20 rounded-[var(--radius-editorial)] p-2">
                        {call.error}
                      </div>
                    )}

                    {metadataPairs.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] font-semibold text-[var(--color-accent)] uppercase tracking-wider">
                            Metadata
                          </span>
                        </div>
                        <dl className="grid grid-cols-1 gap-1 text-xs">
                          {metadataPairs.map(([key, value]) => (
                            <div key={key} className="flex justify-between gap-2">
                              <dt className="font-medium text-[var(--color-fg-muted)]">{key}</dt>
                              <dd className="text-right text-[var(--color-fg)] break-words">
                                {value}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
