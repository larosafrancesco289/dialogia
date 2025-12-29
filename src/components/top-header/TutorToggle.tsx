import { AcademicCapIcon } from '@heroicons/react/24/outline';

export function TutorToggle({
  active,
  forceTutorMode,
  onToggle,
}: {
  active: boolean;
  forceTutorMode: boolean;
  onToggle: () => void | Promise<void>;
}) {
  const title = forceTutorMode
    ? 'Tutor Mode is enforced in settings'
    : active
      ? 'Disable Tutor Mode'
      : 'Enable Tutor Mode';

  const baseClass = active ? 'tutor-toggle tutor-toggle--active' : 'tutor-invite';

  return (
    <button
      type="button"
      className={baseClass}
      aria-pressed={active}
      onClick={() => {
        void onToggle();
      }}
      disabled={forceTutorMode}
      title={title}
    >
      <AcademicCapIcon
        className={active ? 'tutor-toggle__icon h-5 w-5' : 'tutor-invite__icon h-5 w-5'}
      />
      <span className={active ? 'tutor-toggle__text' : 'tutor-invite__text'}>
        {active ? 'Tutor On' : 'Start learning session'}
      </span>
    </button>
  );
}
