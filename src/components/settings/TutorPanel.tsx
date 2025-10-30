'use client';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { ModelSearch } from '@/components/ModelSearch';
import type { Chat } from '@/lib/types';
import type { StoreState } from '@/lib/store/types';
import type { RenderSection } from '@/components/settings/types';

type TutorPanelProps = {
  chat: Chat | undefined;
  renderSection: RenderSection;
  experimentalTutor: boolean;
  setUI: (ui: Partial<StoreState['ui']>) => void;
  ui: StoreState['ui'];
  updateChatSettings: (changes: Partial<Chat['settings']>) => Promise<void>;
  tutorDefaultModel: string;
  setTutorDefaultModel: (value: string) => void;
};

export function TutorPanel(props: TutorPanelProps) {
  const {
    chat,
    renderSection,
    experimentalTutor,
    setUI,
    ui,
    updateChatSettings,
    tutorDefaultModel,
    setTutorDefaultModel,
  } = props;

  return (
    <>
      {renderSection(
        'tutor',
        'tutor',
        <SettingsSection title="Tutor">
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm block">Tutor Mode</label>
              <div className="segmented">
                <button
                  className={`segment ${experimentalTutor ? 'is-active' : ''}`}
                  onClick={() => setUI({ experimentalTutor: true })}
                >
                  On
                </button>
                <button
                  className={`segment ${!experimentalTutor ? 'is-active' : ''}`}
                  onClick={() => setUI({ experimentalTutor: false })}
                >
                  Off
                </button>
              </div>
              <div className="text-xs text-muted-foreground">
                Show Tutor controls and enable practice tools (MCQ, fill‑blank, flashcards).
              </div>
            </div>
            {experimentalTutor && (
              <>
                <div className="space-y-1">
                  <label className="text-sm block">Force Tutor Mode</label>
                  <div className="segmented">
                    <button
                      className={`segment ${ui?.forceTutorMode ? 'is-active' : ''}`}
                      onClick={async () => {
                        setUI({ forceTutorMode: true });
                        if (chat) await updateChatSettings({ tutor_mode: true });
                      }}
                    >
                      On
                    </button>
                    <button
                      className={`segment ${!ui?.forceTutorMode ? 'is-active' : ''}`}
                      onClick={() => setUI({ forceTutorMode: false })}
                    >
                      Off
                    </button>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    When enabled, all chats run in Tutor Mode and use the settings below.
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-sm block">Tutor default model</label>
                  <ModelSearch
                    placeholder="Search tutor models"
                    selectedIds={tutorDefaultModel ? [tutorDefaultModel] : []}
                    actionLabel="Use"
                    selectedLabel="Selected"
                    clearOnSelect
                    onSelect={(result) => setTutorDefaultModel(result.id)}
                  />
                  <input
                    className="input w-full"
                    value={tutorDefaultModel}
                    onChange={(e) => setTutorDefaultModel(e.target.value)}
                    placeholder="provider/model"
                  />
                  <div className="text-xs text-muted-foreground">
                    Each Tutor Mode chat automatically uses this model.
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-sm block">Adaptive learning plan</label>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>
                      Tutor chats now auto-generate a structured learning plan from the first
                      message and keep mastery in sync every few turns.
                    </p>
                    <p>
                      The learner model updates automatically—focus on teaching and the system will
                      advance topics when the student is ready.
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </SettingsSection>,
      )}
    </>
  );
}
