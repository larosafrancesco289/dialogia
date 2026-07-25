'use client';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import type { TutorPlanSuggestion } from '@/lib/types';
import { safeKey } from '@/modules/tutor/components/message/shared';

export function PlanSuggestionsCard({
  suggestions,
  compact = false,
}: {
  suggestions: TutorPlanSuggestion[];
  compact?: boolean;
}) {
  if (!suggestions.length) return null;
  return (
    <div
      className={`rounded-lg border border-dashed border-border/80 bg-muted/10 ${
        compact ? 'p-3' : 'p-4'
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        <ArrowPathIcon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Plan recommendations</span>
      </div>
      <div className="space-y-3 text-xs text-muted-foreground">
        {suggestions.map((s, idx) => (
          <div
            key={safeKey(`${s.action}-${idx}`, idx, 'suggestion')}
            className="leading-snug p-2 rounded bg-surface/50 border border-border/30"
          >
            <div className="font-medium text-foreground flex items-center gap-2">
              {s.action}
              {s.priority && (
                <span
                  className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded"
                  style={
                    s.priority === 'high'
                      ? {
                          background: 'var(--feedback-incorrect-bg)',
                          color: 'var(--feedback-incorrect-text)',
                        }
                      : { background: 'var(--color-muted)', color: 'var(--color-fg-muted)' }
                  }
                >
                  {s.priority}
                </span>
              )}
            </div>
            {s.description && <div className="mt-1">{s.description}</div>}
            {s.rationale && (
              <div className="italic text-muted-foreground/80 mt-1">Rationale: {s.rationale}</div>
            )}
            {s.estimatedImpact && (
              <div className="mt-1 text-accent">Impact: {s.estimatedImpact}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
