import { AcademicCapIcon, ChatBubbleOvalLeftIcon } from '@heroicons/react/24/outline';
import { useTutorToggle } from '@/modules/tutor/ui/useTutorToggle';
import { useT } from '@/modules/tutor/i18n';

/**
 * The tutor module's `welcomeModes` slot: Chat or Learn, above the composer on
 * a fresh page. Learn is a mode of its own, so it is chosen where a chat
 * begins rather than found in the header.
 */
export function WelcomeModes() {
  const t = useT();
  const tutor = useTutorToggle();
  // Enforced in Settings, there is nothing to choose.
  if (!tutor.available || tutor.forced) return null;

  const modes = [
    { id: 'chat', label: t('learn.chat'), Icon: ChatBubbleOvalLeftIcon, on: !tutor.active },
    { id: 'learn', label: t('learn.label'), Icon: AcademicCapIcon, on: tutor.active },
  ];
  return (
    <div className="segmented welcome-modes" role="group" aria-label={t('learn.mode')}>
      {modes.map(({ id, label, Icon, on }) => (
        <button
          key={id}
          type="button"
          className={`segment${on ? ' is-active' : ''}`}
          aria-pressed={on}
          onClick={() => {
            if (!on) void tutor.toggle();
          }}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </div>
  );
}
