import { AcademicCapIcon } from '@heroicons/react/24/outline';
import { ModelPicker } from '@/components/ModelPicker';

export function ModelPickerControl({
  tutorActive,
  tutorModelLabel,
}: {
  tutorActive: boolean;
  tutorModelLabel: string;
}) {
  if (!tutorActive) return <ModelPicker />;

  return (
    <div className="tutor-model-pill" title={tutorModelLabel || undefined}>
      <span className="tutor-model-pill__icon">
        <AcademicCapIcon className="h-5 w-5" />
      </span>
      <div className="tutor-model-pill__text">
        <span className="tutor-model-pill__label">Tutor</span>
        {tutorModelLabel && <span className="tutor-model-pill__model">{tutorModelLabel}</span>}
      </div>
    </div>
  );
}
