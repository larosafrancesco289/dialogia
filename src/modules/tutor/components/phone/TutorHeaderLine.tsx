import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { useTutorModel } from '@/lib/hooks/useTutorModel';
import { usePlanCallbacks } from '@/modules/tutor/ui/usePlanCallbacks';
import { useT } from '@/modules/tutor/i18n';

/**
 * The tutor module's `phoneHeaderLine` slot: the line under the chat's title
 * while a session is on, where a normal chat has its model. It says how far
 * the plan has come and opens the Learning Hub, as the model line opens the
 * model picker.
 */
export function TutorHeaderLine() {
  const t = useT();
  const modelLabel = useTutorModel().label;
  const { learningPlan, hasPlan, planProgress, onOpenRightPanel, rightPanelOpen } =
    usePlanCallbacks();

  const canOpen = hasPlan && !!planProgress && !!learningPlan;
  const detail = canOpen
    ? t('hub.topicsOf', { done: planProgress.completed, count: learningPlan.nodes.length })
    : modelLabel;

  return (
    <button
      type="button"
      className="tutor-header-line"
      onClick={canOpen ? () => onOpenRightPanel() : undefined}
      disabled={!canOpen}
      aria-label={canOpen ? t('hub.labelWith', { detail }) : undefined}
      aria-haspopup={canOpen ? 'dialog' : undefined}
      aria-expanded={canOpen ? rightPanelOpen : undefined}
    >
      <span className="tutor-header-line__label">{t('learn.label')}</span>
      {/* The session is live, so its dot is gold, as on desktop. */}
      <span className="tutor-header-line__live" aria-hidden="true" />
      {detail && <span className="tutor-header-line__detail">{detail}</span>}
      {canOpen && <ChevronDownIcon className="tutor-header-line__chevron" aria-hidden="true" />}
    </button>
  );
}
