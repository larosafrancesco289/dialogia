'use client';
import { useMemo } from 'react';
import {
  ChevronDownIcon,
  LightBulbIcon,
  EyeIcon,
  PhotoIcon,
  SpeakerWaveIcon,
  AcademicCapIcon,
} from '@heroicons/react/24/outline';
import { getModelCapabilities } from '@/lib/models';
import { useModelPickerController } from '@/components/modelPicker/useModelPickerController';
import { ModelPicker, type ModelPickerTriggerProps } from '@/components/ModelPicker';
import { CURATED_MODELS } from '@/data/curatedModels';

type ModelPickerTriggerComponentProps = {
  /** When true, shows tutor model as read-only */
  tutorActive?: boolean;
  /** The tutor model ID */
  tutorModelId?: string;
  /** The tutor model display label */
  tutorModelLabel?: string;
};

/**
 * Rich model picker trigger with capability badges.
 * When tutor is active, shows the tutor model as read-only.
 * Otherwise, wraps ModelPicker with a custom styled trigger button.
 */
export function ModelPickerTrigger({
  tutorActive,
  tutorModelId,
  tutorModelLabel,
}: ModelPickerTriggerComponentProps) {
  const { current, modelMap } = useModelPickerController();

  // Determine which model to display (tutor model when active, otherwise regular)
  const displayModelId = tutorActive ? tutorModelId : current?.id;

  // Get model metadata
  const modelMeta = useMemo(() => {
    if (!displayModelId) return null;
    return modelMap.get(displayModelId);
  }, [displayModelId, modelMap]);

  // Get capabilities
  const capabilities = useMemo(() => getModelCapabilities(modelMeta), [modelMeta]);

  // Get curated model icon if available
  const CuratedIcon = useMemo(() => {
    if (!displayModelId) return null;
    const curated = CURATED_MODELS.find((m) => m.id === displayModelId);
    return curated?.Icon ?? null;
  }, [displayModelId]);

  // Build capability badges
  const badges = useMemo(() => {
    const items: { key: string; Icon: typeof LightBulbIcon; title: string }[] = [];
    if (capabilities.canReason) {
      items.push({ key: 'reason', Icon: LightBulbIcon, title: 'Reasoning' });
    }
    if (capabilities.canSee) {
      items.push({ key: 'vision', Icon: EyeIcon, title: 'Vision' });
    }
    if (capabilities.canImageOut) {
      items.push({ key: 'image', Icon: PhotoIcon, title: 'Image generation' });
    }
    if (capabilities.canAudio) {
      items.push({ key: 'audio', Icon: SpeakerWaveIcon, title: 'Audio' });
    }
    return items;
  }, [capabilities]);

  // When tutor is active, show read-only tutor model display
  if (tutorActive) {
    return (
      <div
        className="model-picker-trigger model-picker-trigger--tutor"
        title={`Tutor model: ${tutorModelLabel}`}
      >
        <AcademicCapIcon className="model-picker-trigger__icon model-picker-trigger__icon--tutor h-5 w-5 shrink-0" />
        <span className="model-picker-trigger__name truncate">{tutorModelLabel}</span>
        {badges.length > 0 && (
          <span className="model-picker-trigger__badges hide-on-mobile">
            {badges.map(({ key, Icon, title }) => (
              <Icon key={key} className="model-picker-trigger__badge" title={title} />
            ))}
          </span>
        )}
      </div>
    );
  }

  const renderTrigger = (props: ModelPickerTriggerProps) => {
    const pulseClass = props.limitPulse ? ' ring-2 ring-primary/50 border-primary/40' : '';

    return (
      <button
        type="button"
        className={`model-picker-trigger${pulseClass}`}
        aria-haspopup="dialog"
        aria-expanded={props.isOpen}
        onClick={props.onClick}
        title={props.tooltip}
      >
        {CuratedIcon && <CuratedIcon className="model-picker-trigger__icon h-5 w-5 shrink-0" />}
        <span className="model-picker-trigger__name truncate">{props.label}</span>
        {badges.length > 0 && (
          <span className="model-picker-trigger__badges hide-on-mobile">
            {badges.map(({ key, Icon, title }) => (
              <Icon key={key} className="model-picker-trigger__badge" title={title} />
            ))}
          </span>
        )}
        <ChevronDownIcon className="model-picker-trigger__chevron h-4 w-4 shrink-0" />
      </button>
    );
  };

  return <ModelPicker renderTrigger={renderTrigger} />;
}
