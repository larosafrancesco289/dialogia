import { AcademicCapIcon } from '@heroicons/react/24/outline';
import { useChatStore } from '@/lib/store';
import { useTutorToggle } from '@/modules/tutor/ui/useTutorToggle';
import { useT } from '@/modules/tutor/i18n';

/**
 * The tutor module's `phoneDrawer` slot: the phone's Learn button, as a row
 * in the chat drawer under the book's name. A session is the live thing
 * here, so only its dot is gold.
 */
export function TutorDrawerRow() {
  const t = useT();
  const tutor = useTutorToggle();
  const setUI = useChatStore((s) => s.setUI);
  if (!tutor.inChrome) return null;

  const hint = t(tutor.forced ? 'learn.forced' : tutor.active ? 'learn.tapToLeave' : 'learn.start');

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
        <span className="tutor-drawer-row__label">{t('learn.label')}</span>
        <span className="tutor-drawer-row__hint">{hint}</span>
      </span>
      {tutor.active && <span className="tutor-drawer-row__live" aria-hidden="true" />}
    </button>
  );
}
