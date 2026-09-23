import { AcademicCapIcon } from '@heroicons/react/24/outline';
import { useChatStore } from '@/lib/store';
import { useTutorToggle } from '@/modules/tutor/ui/useTutorToggle';

/**
 * The tutor module's `phoneDrawer` slot: the phone's Tutor button, as a row
 * in the chat drawer under the book's name. A session is the live thing
 * here, so only its dot is gold.
 */
export function TutorDrawerRow() {
  const tutor = useTutorToggle();
  const setUI = useChatStore((s) => s.setUI);
  if (!tutor.available) return null;

  const hint = tutor.forced
    ? 'Every chat is a session'
    : tutor.active
      ? 'In a session; tap to leave'
      : 'Start a learning session';

  return (
    <button
      type="button"
      className="tutor-drawer-row"
      aria-pressed={tutor.active}
      disabled={tutor.forced}
      onClick={async () => {
        // The page the session opens on is what you came for; show it.
        setUI({ mobile: { drawerOpen: false } });
        await tutor.toggle();
      }}
    >
      <AcademicCapIcon className="tutor-drawer-row__icon" aria-hidden="true" />
      <span className="tutor-drawer-row__text">
        <span className="tutor-drawer-row__label">Tutor</span>
        <span className="tutor-drawer-row__hint">{hint}</span>
      </span>
      {tutor.active && <span className="tutor-drawer-row__live" aria-hidden="true" />}
    </button>
  );
}
