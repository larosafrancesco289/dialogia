'use client';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';

export type BraveData = {
  query: string;
  status: 'loading' | 'done' | 'error';
  results?: { title?: string; url?: string; description?: string }[];
  error?: string;
};

export function BraveSourcesPanel({
  data,
  expanded,
  onToggle,
}: {
  data: BraveData;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (data.status === 'loading') {
    return (
      <div className="px-4 pt-3">
        <div className="thinking-panel">
          <div className="flex items-center gap-2 text-sm">
            <span className="loading-dot" aria-hidden />
            <span>Searching the web with Brave…</span>
          </div>
          <div className="thinking-shimmer" aria-hidden />
        </div>
      </div>
    );
  }
  if (data.status === 'error') {
    return (
      <div className="px-4 pt-3">
        <div className="thinking-panel">
          <div className="flex items-center gap-2 text-sm">
            <span className="loading-dot" aria-hidden />
            <span>{data.error || 'Web search failed'}</span>
          </div>
        </div>
      </div>
    );
  }
  const items = data.results || [];
  if (data.status === 'done' && items.length === 0) {
    return (
      <div className="px-4 pt-3">
        <div className="thinking-panel">
          <div className="flex items-center gap-2 text-sm">
            <span className="loading-dot" aria-hidden />
            <span>No web results found</span>
          </div>
        </div>
      </div>
    );
  }
  if (data.status === 'done' && items.length > 0) {
    return (
      <div className="px-4 pt-3">
        <div className="thinking-panel">
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs text-muted-foreground">Web search results (Brave)</div>
            <button
              className="icon-button"
              aria-label={expanded ? 'Hide sources' : 'Show sources'}
              onClick={onToggle}
              aria-pressed={expanded}
            >
              {expanded ? (
                <ChevronUpIcon className="h-4 w-4" />
              ) : (
                <ChevronDownIcon className="h-4 w-4" />
              )}
            </button>
          </div>
          {expanded && (
            <ol className="text-sm space-y-1 pl-5 list-decimal">
              {items.map((r, i) => (
                <li key={i}>
                  <a className="underline" href={r.url} target="_blank" rel="noreferrer">
                    {r.title || r.url || `Result ${i + 1}`}
                  </a>
                  {r.description && (
                    <div className="text-xs text-muted-foreground">{r.description}</div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    );
  }
  return null;
}
