'use client';
import { ChevronDownIcon, ChevronUpIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline';

export function DebugPanel({
  body,
  expanded,
  onToggle,
}: {
  body: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (!body) return null;
  return (
    <div className="px-4 pt-3">
      <div className="thinking-panel">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs text-muted-foreground">Debug request</div>
          <div className="flex items-center gap-1">
            {expanded && (
              <button
                className="icon-button"
                aria-label="Copy request"
                title="Copy request"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(body);
                  } catch {}
                }}
              >
                <DocumentDuplicateIcon className="h-4 w-4" />
              </button>
            )}
            <button
              className="icon-button"
              aria-label={expanded ? 'Hide request' : 'Show request'}
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
        </div>
        {expanded && (
          <>
            <pre className="whitespace-pre-wrap text-xs opacity-90 leading-relaxed mb-3">
              {body}
            </pre>
          </>
        )}
      </div>
    </div>
  );
}
