import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { ModelPicker, type ModelPickerTriggerProps } from '@/components/ModelPicker';
import { rememberSettingsTab } from '@/components/settings/sections/config';
import { useChatStore } from '@/lib/store';
import { useT } from '@/lib/i18n';

type ModelPickerTriggerComponentProps = {
  /** When true, shows tutor model as read-only */
  tutorActive?: boolean;
  /** The tutor model display label */
  tutorModelLabel?: string;
};

/**
 * The model's name at the head of the page, like a running head. Capabilities
 * live in the picker, not here: the bar only says who you are talking to.
 * When tutor is active, the tutor's model is chosen in Settings, so its name
 * opens Settings there.
 */
export function ModelPickerTrigger({
  tutorActive,
  tutorModelLabel,
}: ModelPickerTriggerComponentProps) {
  const t = useT();
  const setUI = useChatStore((s) => s.setUI);
  if (tutorActive) {
    const label = t('header.tutorModel', { model: tutorModelLabel ?? '' });
    return (
      <button
        type="button"
        className="model-picker-trigger"
        aria-label={label}
        title={label}
        onClick={() => {
          rememberSettingsTab('tutor');
          setUI({ showSettings: true });
        }}
      >
        <span className="model-picker-trigger__name truncate">{tutorModelLabel}</span>
      </button>
    );
  }

  const renderTrigger = (props: ModelPickerTriggerProps) => (
    <button
      type="button"
      className="model-picker-trigger"
      aria-haspopup="dialog"
      aria-expanded={props.isOpen}
      onClick={props.onClick}
      title={props.tooltip || undefined}
    >
      <span className="model-picker-trigger__name truncate">{props.label}</span>
      <ChevronDownIcon className="model-picker-trigger__chevron h-4 w-4 shrink-0" />
    </button>
  );

  return <ModelPicker renderTrigger={renderTrigger} />;
}
