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
  // Shown only beside a chat under way, so either choice leaves it in history.
  const title = forceTutorMode
    ? 'Every chat is a learning session (Settings › Tutor)'
    : active
      ? 'Leave this learning session. It stays in your history, and a new chat opens.'
      : 'Start a learning session. It opens as a new chat; this one stays in your history.';

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
      <span className="tutor-toggle__text">Learn</span>
      {/* The session is the live thing on this bar, so it alone is gold. */}
      {active && <span className="tutor-toggle__live" aria-hidden="true" />}
    </button>
  );
}
