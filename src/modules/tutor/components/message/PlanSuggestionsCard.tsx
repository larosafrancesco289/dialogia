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
    <div className="suggestions">
      <p className={`exercise__kicker ${compact ? 'mb-1' : 'mb-2'}`}>Suggested changes</p>
      {suggestions.map((s, idx) => (
        <div key={safeKey(`${s.action}-${idx}`, idx, 'suggestion')} className="suggestion">
          <div className="suggestion__action">
            {s.action}
            {s.priority && (
              <span className={`suggestion__priority${s.priority === 'high' ? ' is-high' : ''}`}>
                {s.priority}
              </span>
            )}
          </div>
          {s.description && <p>{s.description}</p>}
          {s.rationale && <p className="italic">Why: {s.rationale}</p>}
          {s.estimatedImpact && <p>Effect: {s.estimatedImpact}</p>}
        </div>
      ))}
    </div>
  );
}
