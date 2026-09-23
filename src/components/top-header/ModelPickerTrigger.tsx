import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { ModelPicker, type ModelPickerTriggerProps } from '@/components/ModelPicker';

type ModelPickerTriggerComponentProps = {
  /** When true, shows tutor model as read-only */
  tutorActive?: boolean;
  /** The tutor model display label */
  tutorModelLabel?: string;
};

/**
 * The model's name at the head of the page, like a running head. Capabilities
 * live in the picker, not here: the bar only says who you are talking to.
 * When tutor is active, shows the tutor model as read-only.
 */
export function ModelPickerTrigger({
  tutorActive,
  tutorModelLabel,
}: ModelPickerTriggerComponentProps) {
  if (tutorActive) {
    return (
      <div
        className="model-picker-trigger model-picker-trigger--tutor"
        title={`Tutor model: ${tutorModelLabel}. Set it in Settings.`}
      >
        <span className="model-picker-trigger__name truncate">{tutorModelLabel}</span>
      </div>
    );
  }

  const renderTrigger = (props: ModelPickerTriggerProps) => (
    <button
      type="button"
      className="model-picker-trigger"
      aria-haspopup="dialog"
      aria-expanded={props.isOpen}
      onClick={props.onClick}
      title={props.tooltip}
    >
      <span className="model-picker-trigger__name truncate">{props.label}</span>
      <ChevronDownIcon className="model-picker-trigger__chevron h-4 w-4 shrink-0" />
    </button>
  );

  return <ModelPicker renderTrigger={renderTrigger} />;
}
