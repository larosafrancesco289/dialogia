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

  return (
    <button
      className={`btn shrink-0 ${active ? 'btn-primary' : 'btn-outline'}`}
      aria-pressed={active}
      onClick={() => {
        void onToggle();
      }}
      disabled={forceTutorMode}
      title={title}
    >
      <AcademicCapIcon className="h-5 w-5" />
      <span className="hidden sm:inline ml-1">{active ? 'Tutor On' : 'Tutor Off'}</span>
    </button>
  );
}
