'use client';
import { ChevronDownIcon, ChevronUpIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline';

export function ReasoningPanel({
  reasoning,
  expanded,
  onToggle,
}: {
  reasoning: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (!reasoning) return null;
  return (
    <div className="px-4 pt-3">
      <div className="thinking-panel">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs text-muted-foreground">Thinking</div>
          <div className="flex items-center gap-1">
            {expanded && (
              <button
                className="icon-button"
                aria-label="Copy thinking"
                title="Copy thinking"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(reasoning);
                  } catch {}
                }}
              >
                <DocumentDuplicateIcon className="h-4 w-4" />
              </button>
            )}
            <button
              className="icon-button"
              aria-label={expanded ? 'Hide thinking' : 'Show thinking'}
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
            <pre className="whitespace-pre-wrap text-sm opacity-90 leading-relaxed">
              {reasoning}
            </pre>
            <div className="thinking-shimmer" aria-hidden />
          </>
        )}
      </div>
    </div>
  );
}
