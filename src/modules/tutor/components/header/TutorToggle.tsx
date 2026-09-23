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
    ? 'Tutor mode is enforced in Settings'
    : active
      ? 'Leave tutor mode. Opens a new chat; this session stays in your history.'
      : 'Start a learning session';

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
      <span className="tutor-toggle__text">{active ? 'Tutor' : 'Start learning session'}</span>
      {/* The session is the live thing on this bar, so it alone is gold. */}
      {active && <span className="tutor-toggle__live" aria-hidden="true" />}
    </button>
  );
}
