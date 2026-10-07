import { AcademicCapIcon } from '@heroicons/react/24/outline';
import { useT } from '@/modules/tutor/i18n';

export function TutorToggle({
  active,
  forceTutorMode,
  onToggle,
}: {
  active: boolean;
  forceTutorMode: boolean;
  onToggle: () => void | Promise<void>;
}) {
  const t = useT();
  // Shown only beside a chat under way, so either choice leaves it in history.
  const title = t(
    forceTutorMode ? 'learn.forcedHint' : active ? 'learn.leaveHint' : 'learn.startHint',
  );

  return (
    <button
      type="button"
      className={`tutor-toggle${active ? ' tutor-toggle--active' : ''}`}
      aria-pressed={active}
      onClick={() => {
        void onToggle();
      }}
      disabled={forceTutorMode}
      title={title}
    >
      <AcademicCapIcon className="tutor-toggle__icon h-5 w-5" />
      <span className="tutor-toggle__text">{t('learn.label')}</span>
      {/* The session is the live thing on this bar, so it alone is gold. */}
      {active && <span className="tutor-toggle__live" aria-hidden="true" />}
    </button>
  );
}
