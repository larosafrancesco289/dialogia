'use client';
import type { ReactNode } from 'react';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { IconButton } from '@/components/IconButton';
import { CheckIcon, PlusIcon, PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import {
  addSystemPreset,
  deleteSystemPreset,
  getSystemPresets,
  updateSystemPreset,
  type SystemPreset,
} from '@/lib/presets';
import type { Chat } from '@/lib/types';
import type { RenderSection } from '@/components/settings/types';

type ChatPanelProps = {
  chat: Chat | undefined;
  system: string;
  setSystem: (value: string) => void;
  presets: SystemPreset[];
  setPresets: (list: SystemPreset[]) => void;
  selectedPresetId: string;
  setSelectedPresetId: (id: string) => void;
  updateChatSettings: (changes: Partial<Chat['settings']>) => Promise<void>;
  renderSection: RenderSection;
  temperatureStr: string;
  setTemperatureStr: (value: string) => void;
  setTemperature: (value: number | undefined) => void;
  topPStr: string;
  setTopPStr: (value: string) => void;
  setTopP: (value: number | undefined) => void;
  maxTokensStr: string;
  setMaxTokensStr: (value: string) => void;
  setMaxTokens: (value: number | undefined) => void;
  reasoningEffort: 'none' | 'low' | 'medium' | 'high' | undefined;
  setReasoningEffort: (value: 'none' | 'low' | 'medium' | 'high' | undefined) => void;
  reasoningTokensStr: string;
  setReasoningTokensStr: (value: string) => void;
  setReasoningTokens: (value: number | undefined) => void;
};

export function ChatPanel(props: ChatPanelProps) {
  const {
    chat,
    system,
    setSystem,
    presets,
    setPresets,
    selectedPresetId,
    setSelectedPresetId,
    updateChatSettings,
    renderSection,
    temperatureStr,
    setTemperatureStr,
    setTemperature,
    topPStr,
    setTopPStr,
    setTopP,
    maxTokensStr,
    setMaxTokensStr,
    setMaxTokens,
    reasoningEffort,
    setReasoningEffort,
    reasoningTokensStr,
    setReasoningTokensStr,
    setReasoningTokens,
  } = props;

  const applyPreset = async () => {
    const preset = presets.find((p) => p.id === selectedPresetId);
    if (!preset) return;
    setSystem(preset.system);
    if (chat) await updateChatSettings({ system: preset.system });
  };

  const refreshPresets = async () => {
    const list = await getSystemPresets();
    const sorted = list.slice().sort((a, b) => a.name.localeCompare(b.name));
    setPresets(sorted);
  };

  const savePreset = async () => {
    const name = window.prompt('Preset name?');
    if (name == null) return;
    const preset = await addSystemPreset(name, system);
    setSelectedPresetId(preset.id);
    await refreshPresets();
  };

  const renamePreset = async () => {
    const preset = presets.find((p) => p.id === selectedPresetId);
    if (!preset) return;
    const next = window.prompt('Rename preset', preset.name);
    if (next == null) return;
    await updateSystemPreset(preset.id, { name: next.trim() || preset.name });
    await refreshPresets();
  };

  const deletePreset = async () => {
    const preset = presets.find((p) => p.id === selectedPresetId);
    if (!preset) return;
    const ok = window.confirm(`Delete preset "${preset.name}"?`);
    if (!ok) return;
    await deleteSystemPreset(preset.id);
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
                <IconButton
                  title="Apply preset"
                  onClick={() => {
                    void applyPreset();
                  }}
                  disabled={!selectedPresetId}
                >
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
              onBlur={async () => {
                if (!chat) return;
                await updateChatSettings({ system });
              }}
              onKeyDown={(e) => e.stopPropagation()}
            />
            <div className="text-xs text-muted-foreground">
              Customize the default system prompt for this chat.
            </div>
          </div>
        </SettingsSection>,
      )}

      {renderSection(
        'chat',
        'generation',
        <SettingsSection title="Generation">
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm flex items-center justify-between">
                <span>Temperature</span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setTemperature(undefined);
                    setTemperatureStr('');
                  }}
                >
                  Reset
                </button>
              </label>
              <input
                className="input w-full"
                inputMode="decimal"
                placeholder="model default"
                value={temperatureStr}
                onChange={(e) => setTemperatureStr(e.target.value)}
                onBlur={() => {
                  const value = temperatureStr.trim();
                  if (value === '') {
                    setTemperature(undefined);
                    return;
                  }
                  const parsed = Number(value);
                  if (!Number.isNaN(parsed)) setTemperature(parsed);
                }}
                onKeyDown={(e) => e.stopPropagation()}
              />
              <div className="text-xs text-muted-foreground">
                Higher = more creative. Leave blank for model default.
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm flex items-center justify-between">
                <span>Top_p</span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setTopP(undefined);
                    setTopPStr('');
                  }}
                >
                  Reset
                </button>
              </label>
              <input
                className="input w-full"
                inputMode="decimal"
                placeholder="model default"
                value={topPStr}
                onChange={(e) => setTopPStr(e.target.value)}
                onBlur={() => {
                  const value = topPStr.trim();
                  if (value === '') {
                    setTopP(undefined);
                    return;
                  }
                  const parsed = Number(value);
                  if (!Number.isNaN(parsed)) setTopP(parsed);
                }}
                onKeyDown={(e) => e.stopPropagation()}
              />
              <div className="text-xs text-muted-foreground">
                Nucleus sampling. 1.0 ≈ off. Leave blank for default.
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm flex items-center justify-between">
                <span>Max tokens</span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setMaxTokens(undefined);
                    setMaxTokensStr('');
                  }}
                >
                  Auto
                </button>
              </label>
              <input
                className="input w-full"
                inputMode="numeric"
                placeholder="auto"
                value={maxTokensStr}
                onChange={(e) => setMaxTokensStr(e.target.value)}
                onBlur={() => {
                  const value = maxTokensStr.trim();
                  if (value === '') {
                    setMaxTokens(undefined);
                    return;
                  }
                  const parsed = Number(value);
                  if (!Number.isNaN(parsed)) setMaxTokens(Math.floor(parsed));
                }}
                onKeyDown={(e) => e.stopPropagation()}
              />
              <div className="text-xs text-muted-foreground">
                Upper bound on output length. Leave blank to auto-select.
              </div>
            </div>
          </div>
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
                onChange={(e) => setReasoningEffort((e.target.value || undefined) as any)}
              >
                <option value="">model default</option>
                <option value="none">none</option>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
              <div className="text-xs text-muted-foreground">
                Request model reasoning depth (if supported).
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
