import { useState } from 'react';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconButton } from '@/components/ui/IconButton';
import { PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import type { SystemPreset } from '@/lib/presets';
import {
  loadSystemPresets,
  removeSystemPreset,
  renameSystemPreset,
  saveSystemPreset,
} from '@/lib/settings/systemPresets';
import type { RenderSection } from '@/components/settings/types';
import type { ReasoningEffort } from '@/lib/types';

type ChatPanelProps = {
  system: string;
  setSystem: (value: string) => void;
  presets: SystemPreset[];
  setPresets: (list: SystemPreset[]) => void;
  selectedPresetId: string;
  setSelectedPresetId: (id: string) => void;
  renderSection: RenderSection;
  reasoningEffort: ReasoningEffort | undefined;
  setReasoningEffort: (value: ReasoningEffort | undefined) => void;
  reasoningTokensStr: string;
  setReasoningTokensStr: (value: string) => void;
  setReasoningTokens: (value: number | undefined) => void;
  messageTimestamps: boolean | undefined;
  setMessageTimestamps: (value: boolean) => void;
};

export function ChatPanel(props: ChatPanelProps) {
  const {
    system,
    setSystem,
    presets,
    setPresets,
    selectedPresetId,
    setSelectedPresetId,
    renderSection,
    reasoningEffort,
    setReasoningEffort,
    reasoningTokensStr,
    setReasoningTokensStr,
    setReasoningTokens,
    messageTimestamps,
    setMessageTimestamps,
  } = props;

  // Presets are edited in place: a name field appears for saving or renaming,
  // and deleting asks once, inline, instead of through browser prompts.
  const [presetMode, setPresetMode] = useState<'idle' | 'save' | 'rename' | 'delete'>('idle');
  const [presetName, setPresetName] = useState('');
  const selectedPreset = presets.find((p) => p.id === selectedPresetId);

  const refreshPresets = async () => {
    setPresets(await loadSystemPresets());
  };

  const finish = () => {
    setPresetMode('idle');
    setPresetName('');
  };

  const commitPresetName = async () => {
    const name = presetName.trim();
    if (!name) return;
    if (presetMode === 'save') {
      const preset = await saveSystemPreset(name, system);
      setSelectedPresetId(preset.id);
    } else if (presetMode === 'rename' && selectedPreset) {
      await renameSystemPreset(selectedPreset.id, name);
    }
    await refreshPresets();
    finish();
  };

  const confirmDelete = async () => {
    if (!selectedPreset) return;
    await removeSystemPreset(selectedPreset.id);
    await refreshPresets();
    setSelectedPresetId('');
    finish();
  };

  return (
    <>
      {renderSection(
        'chat',
        'general',
        <SettingsSection title="System prompt">
          <div className="field">
            <textarea
              className="textarea w-full"
              rows={5}
              value={system}
              aria-label="System prompt"
              onChange={(e) => setSystem(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
            />
            <p className="field__hint">
              What every new chat is told before your first message. A tutoring session adds its own
              instructions on top.
            </p>
          </div>

          <div className="field">
            <span className="field__label">Presets</span>
            {presetMode === 'save' || presetMode === 'rename' ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="input flex-1 min-w-0"
                  value={presetName}
                  placeholder={presetMode === 'save' ? 'Name this prompt' : 'New name'}
                  autoFocus
                  onChange={(e) => setPresetName(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') void commitPresetName();
                    if (e.key === 'Escape') finish();
                  }}
                />
                <button className="btn-ghost btn-sm" onClick={finish}>
                  Cancel
                </button>
                <button
                  className="btn btn-sm"
                  disabled={!presetName.trim()}
                  onClick={() => void commitPresetName()}
                >
                  {presetMode === 'save' ? 'Save' : 'Rename'}
                </button>
              </div>
            ) : presetMode === 'delete' && selectedPreset ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex-1 text-sm">Delete “{selectedPreset.name}”?</span>
                <button className="btn-ghost btn-sm" onClick={finish}>
                  Cancel
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => void confirmDelete()}>
                  Delete
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="input flex-1 basis-full sm:basis-0 min-w-0"
                  value={selectedPresetId}
                  aria-label="Preset"
                  onChange={(e) => setSelectedPresetId(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <option value="">Choose a preset…</option>
                  {presets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
                <button
                  className="btn-outline btn-sm"
                  disabled={!selectedPreset}
                  onClick={() => selectedPreset && setSystem(selectedPreset.system)}
                >
                  Use
                </button>
                <button className="btn-ghost btn-sm" onClick={() => setPresetMode('save')}>
                  Save current
                </button>
                {selectedPreset && (
                  <>
                    <IconButton
                      title="Rename preset"
                      onClick={() => {
                        setPresetName(selectedPreset.name);
                        setPresetMode('rename');
                      }}
                    >
                      <PencilSquareIcon className="h-4 w-4" />
                    </IconButton>
                    <IconButton title="Delete preset" onClick={() => setPresetMode('delete')}>
                      <TrashIcon className="h-4 w-4" />
                    </IconButton>
                  </>
                )}
              </div>
            )}
          </div>

          <ToggleSwitch
            checked={messageTimestamps === true}
            onChange={setMessageTimestamps}
            label="Message timestamps"
            description="Tell the model when each message was sent, so it knows the date. Adds a few tokens per message."
          />
        </SettingsSection>,
      )}

      {renderSection(
        'chat',
        'reasoning',
        <SettingsSection title="Reasoning">
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="field__label" htmlFor="settings-reasoning-effort">
                Reasoning effort
              </label>
              <select
                id="settings-reasoning-effort"
                className="input w-full"
                value={reasoningEffort ?? ''}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '') {
                    setReasoningEffort(undefined);
                    return;
                  }
                  if (
                    value === 'none' ||
                    value === 'minimal' ||
                    value === 'low' ||
                    value === 'medium' ||
                    value === 'high' ||
                    value === 'xhigh' ||
                    value === 'max'
                  ) {
                    setReasoningEffort(value);
                    if (value === 'none') {
                      setReasoningTokens(undefined);
                      setReasoningTokensStr('');
                    }
                  }
                }}
              >
                <option value="">Model default</option>
                <option value="none">Off</option>
                <option value="minimal">Minimal</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="xhigh">Extra high</option>
                <option value="max">Max</option>
              </select>
              <div className="field__hint">
                How hard new chats think by default. Change it per chat from the composer; a model
                that lacks a level uses the nearest one it has.
              </div>
            </div>
            <div className="space-y-1">
              <label className="field__label" htmlFor="settings-reasoning-tokens">
                Reasoning tokens
              </label>
              <input
                id="settings-reasoning-tokens"
                className="input w-full"
                inputMode="numeric"
                placeholder="Automatic"
                value={reasoningTokensStr}
                onChange={(e) => setReasoningTokensStr(e.target.value)}
                onBlur={() => {
                  const value = reasoningTokensStr.trim();
                  if (value === '') {
                    setReasoningTokens(undefined);
                    return;
                  }
                  const parsed = Number(value);
                  if (!Number.isNaN(parsed)) setReasoningTokens(Math.floor(parsed));
                }}
                onKeyDown={(e) => e.stopPropagation()}
              />
              <div className="field__hint">
                A cap on thinking tokens, for models that accept one. Leave it empty to let the
                model decide.
              </div>
            </div>
          </div>
        </SettingsSection>,
      )}
    </>
  );
}
