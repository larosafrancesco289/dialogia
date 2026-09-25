import { SettingsSection } from '@/components/settings/SettingsSection';
import { ModelSearch } from '@/components/ModelSearch';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { useChatStore } from '@/lib/store';
import { findModelById, formatModelLabel, isDynamicModelId } from '@/lib/models';
import { getModelProviderLabel } from '@/lib/providers';
import type { StoreState } from '@/lib/store/types';
import type { RenderSection } from '@/components/settings/types';

type TutorPanelProps = {
  renderSection: RenderSection;
  experimentalTutor: boolean;
  setUI: (ui: Partial<StoreState['ui']>) => void;
  ui: StoreState['ui'];
  onForceTutorModeChange: (enabled: boolean) => Promise<void>;
  tutorDefaultModel: string;
  setTutorDefaultModel: (value: string) => void;
};

export function TutorPanel(props: TutorPanelProps) {
  const {
    renderSection,
    experimentalTutor,
    setUI,
    ui,
    onForceTutorModeChange,
    tutorDefaultModel,
    setTutorDefaultModel,
  } = props;
  const models = useChatStore((s) => s.models);
  // Named as the header's model picker names it, with the provider beneath as
  // the favorites list has it; the raw id only for a model the list lacks.
  const modelMeta = findModelById(models, tutorDefaultModel);
  const modelName = formatModelLabel({ model: modelMeta, fallbackId: tutorDefaultModel });
  const modelDetail = isDynamicModelId(tutorDefaultModel)
    ? 'Always the newest release'
    : modelMeta
      ? getModelProviderLabel(modelMeta)
      : tutorDefaultModel;

  return (
    <>
      {renderSection(
        'tutor',
        'tutor',
        <SettingsSection title="Tutor">
          <ToggleSwitch
            checked={experimentalTutor}
            onChange={(checked) => setUI({ flags: { experimentalTutor: checked } })}
            label="Tutor mode"
            description="Show the Tutor button and its practice tools: a learning plan and multiple-choice questions."
          />
          {experimentalTutor && (
            <>
              <ToggleSwitch
                checked={!!ui?.tutor?.forceMode}
                onChange={(checked) => {
                  void onForceTutorModeChange(checked);
                }}
                label="Always tutor"
                description="Every chat runs as a tutoring session, with the settings below."
              />
              <ToggleSwitch
                checked={!!ui?.tutor?.autoScroll}
                onChange={(checked) => setUI({ tutor: { autoScroll: checked } })}
                label="Follow the tutor"
                description="Scroll to the latest message while the tutor responds."
              />
              <div className="field">
                <span className="field__label">Tutor model</span>
                <div>
                  <span className="settings-list__name">{modelName}</span>
                  <span className="settings-list__meta">{modelDetail}</span>
                </div>
                <ModelSearch
                  placeholder="Search for another model"
                  ariaLabel="Search for a tutor model"
                  selectedIds={tutorDefaultModel ? [tutorDefaultModel] : []}
                  clearOnSelect
                  onSelect={(result) => setTutorDefaultModel(result.id)}
                />
                <p className="field__hint">Every tutoring session uses this model.</p>
              </div>
              <p className="field__hint">
                Each session drafts a learning plan from your first message and keeps the learner
                model in step as you go. The tutor moves on to the next topic when you are ready.
              </p>
            </>
          )}
        </SettingsSection>,
      )}
    </>
  );
}
