'use client';
import type { ReactNode } from 'react';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { ModelSearch } from '@/components/ModelSearch';
import type { Chat, ORModel } from '@/lib/types';
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
  tutorMemoryModel: string;
  setTutorMemoryModel: (value: string) => void;
  tutorMemoryFrequency: number;
  tutorMemoryFrequencyStr: string;
  setTutorMemoryFrequency: (value: number) => void;
  setTutorMemoryFrequencyStr: (value: string) => void;
  tutorMemoryAutoUpdate: boolean;
  setTutorMemoryAutoUpdate: (value: boolean) => void;
  tutorMemorySnapshot: string;
  setTutorMemorySnapshot: (value: string) => void;
  models: ORModel[];
  defaultTutorMemoryFrequency: number;
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
    tutorMemoryModel,
    setTutorMemoryModel,
    tutorMemoryFrequency,
    tutorMemoryFrequencyStr,
    setTutorMemoryFrequency,
    setTutorMemoryFrequencyStr,
    tutorMemoryAutoUpdate,
    setTutorMemoryAutoUpdate,
    tutorMemorySnapshot,
    setTutorMemorySnapshot,
    models,
    defaultTutorMemoryFrequency,
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
                    list="tutor-model-options"
                    placeholder="provider/model"
                  />
                  <div className="text-xs text-muted-foreground">
                    Each Tutor Mode chat automatically uses this model.
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-sm block">Memory update model</label>
                    <ModelSearch
                      placeholder="Search models for memory updates"
                      selectedIds={tutorMemoryModel ? [tutorMemoryModel] : []}
                      actionLabel="Use"
                      selectedLabel="Selected"
                      clearOnSelect
                      onSelect={(result) => setTutorMemoryModel(result.id)}
                    />
                    <input
                      className="input w-full"
                      value={tutorMemoryModel}
                      onChange={(e) => setTutorMemoryModel(e.target.value)}
                      list="tutor-model-options"
                      placeholder="provider/model"
                    />
                    <div className="text-xs text-muted-foreground">
                      Tutor memory updates run on this model.
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm flex items-center justify-between">
                      <span>Memory frequency</span>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          setTutorMemoryFrequency(defaultTutorMemoryFrequency);
                          setTutorMemoryFrequencyStr(String(defaultTutorMemoryFrequency));
                        }}
                      >
                        Reset
                      </button>
                    </label>
                    <input
                      className="input w-full"
                      inputMode="numeric"
                      value={tutorMemoryFrequencyStr}
                      onChange={(e) => setTutorMemoryFrequencyStr(e.target.value)}
                      onBlur={() => {
                        const value = tutorMemoryFrequencyStr.trim();
                        const parsed = Number(value);
                        if (!Number.isNaN(parsed) && parsed > 0) setTutorMemoryFrequency(parsed);
                      }}
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                    <div className="text-xs text-muted-foreground">
                      Run memory updates every N Tutor messages.
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-sm block">Auto-update memory</label>
                  <div className="segmented">
                    <button
                      className={`segment ${tutorMemoryAutoUpdate ? 'is-active' : ''}`}
                      onClick={() => setTutorMemoryAutoUpdate(true)}
                    >
                      On
                    </button>
                    <button
                      className={`segment ${!tutorMemoryAutoUpdate ? 'is-active' : ''}`}
                      onClick={() => setTutorMemoryAutoUpdate(false)}
                    >
                      Off
                    </button>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Controls whether new Tutor Mode chats begin with automatic memory updates.
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-sm block">Shared tutor memory</label>
                  <textarea
                    className="textarea w-full"
                    rows={6}
                    value={tutorMemorySnapshot}
                    onChange={(e) => setTutorMemorySnapshot(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                  <div className="text-xs text-muted-foreground">
                    Acts as the persistent tutor scratchpad (max 1000 tokens). Updates apply to all
                    Tutor Mode chats.
                  </div>
                </div>
                <datalist id="tutor-model-options">
                  {models.slice(0, 200).map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name || model.id}
                    </option>
                  ))}
                </datalist>
              </>
            )}
          </div>
        </SettingsSection>,
      )}
    </>
  );
}
