import { AcademicCapIcon, ChatBubbleOvalLeftIcon } from '@heroicons/react/24/outline';
import { useTutorToggle } from '@/modules/tutor/ui/useTutorToggle';

/**
 * The tutor module's `welcomeModes` slot: Chat or Learn, above the composer on
 * a fresh page. Learn is a mode of its own, so it is chosen where a chat
 * begins rather than found in the header.
 */
export function WelcomeModes() {
  const tutor = useTutorToggle();
  // Enforced in Settings, there is nothing to choose.
  if (!tutor.available || tutor.forced) return null;

  const modes = [
    { label: 'Chat', Icon: ChatBubbleOvalLeftIcon, on: !tutor.active },
    { label: 'Learn', Icon: AcademicCapIcon, on: tutor.active },
  ];
  return (
    <div className="segmented welcome-modes" role="group" aria-label="Mode">
      {modes.map(({ label, Icon, on }) => (
        <button
          key={label}
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
