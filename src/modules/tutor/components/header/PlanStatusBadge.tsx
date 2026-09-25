import { BookOpenIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import type { LearningPlan } from '@/lib/types';
import type { UiPlanSnapshot } from '@/lib/contracts/ui';

type PlanGeneration = NonNullable<UiPlanSnapshot['generationByChatId']>[string];

type PlanProgress = {
  completed: number;
  percentComplete: number;
};

export function PlanStatusBadge({
  planGeneration,
  hasPlan,
  planProgress,
  learningPlan,
  panelOpen,
  onToggleRightPanel,
}: {
  planGeneration?: PlanGeneration;
  hasPlan: boolean;
  planProgress: PlanProgress | null;
  learningPlan?: LearningPlan;
  panelOpen?: boolean;
  onToggleRightPanel: () => void;
}) {
  if (planGeneration?.status === 'loading') {
    return (
      <span className="plan-status" title={planGeneration.goal || undefined} role="status">
        {/* The drafting itself is shown in the chat; the head only names it. */}
        <BookOpenIcon className="plan-status__icon" />
        <span className="plan-status__text">Drafting a plan…</span>
      </span>
    );
  }

  if (planGeneration?.status === 'error' && !hasPlan) {
    return (
      <span
        className="plan-status plan-status--error"
        title={planGeneration.error || 'Plan generation failed'}
        role="status"
      >
        <ExclamationTriangleIcon className="plan-status__icon" />
        <span className="plan-status__text">No plan yet</span>
      </span>
    );
  }

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
