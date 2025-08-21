'use client';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';

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
