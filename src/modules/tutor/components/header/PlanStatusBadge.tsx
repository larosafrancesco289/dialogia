import { BookOpenIcon } from '@heroicons/react/24/outline';
import type { LearningPlan } from '@/lib/types';
import { useT } from '@/modules/tutor/i18n';

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
  const t = useT();
  if (!hasPlan || !planProgress || !learningPlan) return null;

  return (
    <button
      type="button"
      className="plan-button"
      onClick={onToggleRightPanel}
      title={t(panelOpen ? 'hub.close' : 'hub.open')}
      aria-label={t(panelOpen ? 'hub.close' : 'hub.open')}
      aria-pressed={panelOpen}
    >
      <BookOpenIcon className="plan-button__icon h-5 w-5" />
      {/* Topics done, in the panel's own words; a bare percentage here read as
          mastery and disagreed with the Learning Hub. */}
      <span
        className="plan-button__progress"
        aria-label={t('hub.topicsDone', {
          done: planProgress.completed,
          count: learningPlan.nodes.length,
        })}
      >
        {planProgress.completed}/{learningPlan.nodes.length}
      </span>
    </button>
  );
}
