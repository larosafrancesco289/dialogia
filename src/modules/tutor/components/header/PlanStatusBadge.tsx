import { BookOpenIcon } from '@heroicons/react/24/outline';
import type { LearningPlan } from '@/lib/types';

type PlanProgress = {
  completed: number;
  percentComplete: number;
};

export function PlanStatusBadge({
  hasPlan,
  planProgress,
  learningPlan,
  panelOpen,
  onToggleRightPanel,
}: {
  hasPlan: boolean;
  planProgress: PlanProgress | null;
  learningPlan?: LearningPlan;
  panelOpen?: boolean;
  onToggleRightPanel: () => void;
}) {
  if (!hasPlan || !planProgress || !learningPlan) return null;

  return (
    <button
      type="button"
      className="plan-button"
      onClick={onToggleRightPanel}
      title={panelOpen ? 'Close Learning Hub' : 'Open Learning Hub'}
      aria-label={panelOpen ? 'Close Learning Hub' : 'Open Learning Hub'}
      aria-pressed={panelOpen}
    >
      <BookOpenIcon className="plan-button__icon h-5 w-5" />
      {/* Topics done, in the panel's own words; a bare percentage here read as
          mastery and disagreed with the Learning Hub. */}
      <span
        className="plan-button__progress"
        aria-label={`${planProgress.completed} of ${learningPlan.nodes.length} topics done`}
      >
        {planProgress.completed}/{learningPlan.nodes.length}
      </span>
    </button>
  );
}
