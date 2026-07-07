'use client';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconButton } from '@/components/ui/IconButton';
import { CheckIcon, PlusIcon, PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
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

  const applyPreset = () => {
    const preset = presets.find((p) => p.id === selectedPresetId);
    if (!preset) return;
    setSystem(preset.system);
  };

  const refreshPresets = async () => {
    setPresets(await loadSystemPresets());
  };

  const savePreset = async () => {
    const name = window.prompt('Preset name?');
    if (name == null) return;
    const preset = await saveSystemPreset(name, system);
    setSelectedPresetId(preset.id);
    await refreshPresets();
  };

  const renamePreset = async () => {
    const preset = presets.find((p) => p.id === selectedPresetId);
    if (!preset) return;
    const next = window.prompt('Rename preset', preset.name);
    if (next == null) return;
    await renameSystemPreset(preset.id, next.trim() || preset.name);
    await refreshPresets();
  };

  const deletePreset = async () => {
    const preset = presets.find((p) => p.id === selectedPresetId);
    if (!preset) return;
    const ok = window.confirm(`Delete preset "${preset.name}"?`);
    if (!ok) return;
    await removeSystemPreset(preset.id);
    await refreshPresets();
    setSelectedPresetId('');
  };

  return (
    <>
      {renderSection(
        'chat',
        'general',
        <SettingsSection title="General">
          <div className="space-y-2">
            <label className="text-sm">System prompt</label>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="input"
                value={selectedPresetId}
                onChange={(e) => setSelectedPresetId(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <option value="">Select a preset…</option>
                {presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-1">
                <IconButton title="Apply preset" onClick={applyPreset} disabled={!selectedPresetId}>
                  <CheckIcon className="h-5 w-5" />
                </IconButton>
                <IconButton
                  title="Save as preset"
                  onClick={() => {
                    void savePreset();
                  }}
                >
                  <PlusIcon className="h-5 w-5" />
                </IconButton>
                <IconButton
                  title="Rename preset"
                  onClick={() => {
                    void renamePreset();
                  }}
                  disabled={!selectedPresetId}
                >
                  <PencilSquareIcon className="h-5 w-5" />
                </IconButton>
                <IconButton
                  title="Delete preset"
                  onClick={() => {
                    void deletePreset();
                  }}
                  disabled={!selectedPresetId}
                >
                  <TrashIcon className="h-5 w-5" />
                </IconButton>
              </div>
            </div>
            <textarea
              className="textarea w-full"
              rows={4}
              value={system}
              onChange={(e) => setSystem(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
            />
            <div className="text-xs text-muted-foreground">
              Customize the default system prompt for future chats. Tutor Mode remains a separate
              overlay.
            </div>
          </div>
          <ToggleSwitch
            checked={messageTimestamps === true}
            onChange={setMessageTimestamps}
            label="Message timestamps"
            description="Prefix each message sent to the model with its date and time, so it knows when the conversation happened. Adds a few tokens per message."
          />
        </SettingsSection>,
      )}

      {renderSection(
        'chat',
        'reasoning',
        <SettingsSection title="Reasoning">
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm flex items-center justify-between">
                <span>Reasoning effort</span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setReasoningEffort(undefined)}
                >
                  Default
                </button>
              </label>
              <select
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
                    value === 'low' ||
                    value === 'medium' ||
                    value === 'high' ||
                    value === 'xhigh'
                  ) {
                    setReasoningEffort(value);
                    if (value === 'none') {
                      setReasoningTokens(undefined);
                      setReasoningTokensStr('');
                    }
                  }
                }}
              >
                <option value="">standard (medium)</option>
                <option value="none">none</option>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="xhigh">extra high</option>
              </select>
              <div className="text-xs text-muted-foreground">
                Reasoning depth new chats start with (if the model supports it). Adjustable per chat
                from the composer.
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm flex items-center justify-between">
                <span>Reasoning tokens</span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setReasoningTokens(undefined);
                    setReasoningTokensStr('');
                  }}
                >
                  Auto
                </button>
              </label>
              <input
                className="input w-full"
                inputMode="numeric"
                placeholder="auto"
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
              <div className="text-xs text-muted-foreground">
                Budget for chain‑of‑thought tokens (supported models only).
              </div>
            </div>
          </div>
        </SettingsSection>,
      )}
    </>
  );
}
