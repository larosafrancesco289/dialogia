import { useMemo, useState } from 'react';
import {
  CheckIcon,
  ChevronDownIcon,
  ClipboardIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import type { ToolCallLogEntry } from '@/lib/types';
import { IconButton } from '@/components/ui/IconButton';
import { copyText } from '@/lib/clipboard';

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

// Muted for done and pending, crimson for failed. Pending never turns gold: the log cannot tell
// a call still running from one a stopped turn left behind, so it never
// claims the gold that marks live work.
function statusIcon(status: ToolCallLogEntry['status']) {
  if (status === 'success') {
    return <CheckIcon className="tool-log__status" aria-hidden="true" />;
  }
  if (status === 'error') {
    return <XMarkIcon className="tool-log__status is-error" aria-hidden="true" />;
  }
  return <ClockIcon className="tool-log__status" aria-hidden="true" />;
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

function JsonBlock({ label, value }: { label: 'Input' | 'Output'; value: unknown }) {
  return (
    <div>
      <div className="devtools__section-head">
        <span className="devtools__label">{label}</span>
        <IconButton
          size="sm"
          title={`Copy ${label.toLowerCase()} JSON`}
          onClick={() => void copyText(stringify(value))}
        >
          <ClipboardIcon className="h-4 w-4" />
        </IconButton>
      </div>
      <pre className="devtools__code">
        <code>{stringify(value)}</code>
      </pre>
    </div>
  );
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

  const heading = <span className="devtools__label">Tool calls ({sortedCalls.length})</span>;

  return (
    <div className={['tool-log', className].filter(Boolean).join(' ')}>
      {collapsible ? (
        <button
          type="button"
          className="tool-log__head"
          aria-expanded={expanded}
          onClick={() => setExpanded((prev) => !prev)}
        >
          {heading}
          <ChevronDownIcon
            className={`devtools__chevron${expanded ? ' is-open' : ''}`}
            aria-hidden="true"
          />
        </button>
      ) : (
        <div className="tool-log__head">{heading}</div>
      )}
      {expanded && (
        <div className="tool-log__calls">
          {sortedCalls.map((call) => {
            const isExpanded = mode === 'full' || !!expandedCalls[call.id];
            const isRecent = highlightRecent && Date.now() - call.timestamp < 10_000;
            const durationLabel = formatDuration(call.duration);
            const badges = collectBadges(call);
            const metadataPairs = metadataEntries(call.metadata);
            return (
              <div key={call.id} className={`tool-log__call${isRecent ? ' is-recent' : ''}`}>
                <button
                  type="button"
                  onClick={() => {
                    if (!onToolClick) {
                      toggleCall(call.id);
                    } else {
                      onToolClick(call);
                    }
                  }}
                  className="tool-log__row"
                >
                  <span className="tool-log__lead">
                    {statusIcon(call.status)}
                    {showTimestamps && (
                      <span className="tool-log__time">{formatTimestamp(call.timestamp)}</span>
                    )}
                    <span className="tool-log__name">{call.name}</span>
                    <span className="tool-log__summary">{summaryForCall(call)}</span>
                  </span>
                  <span className="tool-log__trail">
                    {badges.length > 0 && (
                      <span className="tool-log__tags">
                        {badges.map((badge) => badge.label).join(' · ')}
                      </span>
                    )}
                    {durationLabel && <span className="tool-log__duration">{durationLabel}</span>}
                    {mode !== 'full' && (
                      <ChevronDownIcon
                        className={`devtools__chevron${isExpanded ? ' is-open' : ''}`}
                        aria-hidden="true"
                      />
                    )}
                  </span>
                </button>
                {isExpanded && (
                  <div className="tool-log__detail">
                    <JsonBlock label="Input" value={call.input} />

                    {call.output && <JsonBlock label="Output" value={call.output} />}

                    {call.error && (
                      <p className="tool-log__error">
                        <ExclamationTriangleIcon aria-hidden="true" />
                        <span>{call.error}</span>
                      </p>
                    )}

                    {metadataPairs.length > 0 && (
                      <div>
                        <div className="devtools__section-head">
                          <span className="devtools__label">Metadata</span>
                        </div>
                        <dl className="tool-log__metadata">
                          {metadataPairs.map(([key, value]) => (
                            <div key={key}>
                              <dt>{key}</dt>
                              <dd>{value}</dd>
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
