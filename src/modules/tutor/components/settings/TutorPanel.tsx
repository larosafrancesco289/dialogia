import { SettingsSection } from '@/components/settings/SettingsSection';
import { ModelSearch } from '@/components/ModelSearch';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
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
                <label className="field__label" htmlFor="tutor-model-id">
                  Tutor model
                </label>
                <ModelSearch
                  placeholder="Search models"
                  ariaLabel="Search for a tutor model"
                  selectedIds={tutorDefaultModel ? [tutorDefaultModel] : []}
                  actionLabel="Use"
                  selectedLabel="Selected"
                  clearOnSelect
                  onSelect={(result) => setTutorDefaultModel(result.id)}
                />
                <input
                  id="tutor-model-id"
                  className="input w-full font-mono text-sm"
                  value={tutorDefaultModel}
                  onChange={(e) => setTutorDefaultModel(e.target.value)}
                  placeholder="provider/model"
                  spellCheck={false}
                />
                <p className="field__hint">
                  Every tutoring session uses this model. Search to change it, or type an id; an id
                  starting with ~ follows the newest release.
                </p>
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
