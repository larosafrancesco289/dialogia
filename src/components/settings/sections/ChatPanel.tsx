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
import { useChatStore } from '@/lib/store';
import { useT } from '@/lib/i18n';

const EFFORTS: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

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
  const t = useT();
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
  const [tokensInvalid, setTokensInvalid] = useState(false);
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
        <SettingsSection title={t('settings.section.general')}>
          <div className="field">
            <textarea
              className="textarea w-full"
              rows={5}
              value={system}
              aria-label={t('settings.section.general')}
              onChange={(e) => setSystem(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
            />
            <p className="field__hint">{t('settings.chat.systemHint')}</p>
          </div>

          <div className="field">
            <span className="field__label">{t('settings.chat.savedPrompts')}</span>
            {presetMode === 'save' || presetMode === 'rename' ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="input flex-1 min-w-0"
                  value={presetName}
                  placeholder={t(
                    presetMode === 'save' ? 'settings.chat.namePrompt' : 'settings.chat.newName',
                  )}
                  aria-label={t(
                    presetMode === 'save'
                      ? 'settings.chat.namePrompt'
                      : 'settings.chat.newNameLabel',
                  )}
                  autoFocus
                  onChange={(e) => setPresetName(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') void commitPresetName();
                    if (e.key === 'Escape') finish();
                  }}
                />
                <button className="btn-ghost btn-sm" onClick={finish}>
                  {t('common.cancel')}
                </button>
                <button
                  className="btn btn-sm"
                  disabled={!presetName.trim()}
                  onClick={() => void commitPresetName()}
                >
                  {t(presetMode === 'save' ? 'common.save' : 'chatRow.rename')}
                </button>
              </div>
            ) : presetMode === 'delete' && selectedPreset ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex-1 text-sm">
                  {t('settings.chat.deletePrompt', { name: selectedPreset.name })}
                </span>
                <button className="btn-ghost btn-sm" onClick={finish}>
                  {t('common.cancel')}
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => void confirmDelete()}>
                  {t('common.delete')}
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="input flex-1 basis-full sm:basis-0 min-w-0"
                  value={selectedPresetId}
                  aria-label={t('settings.chat.savedPrompt')}
                  onChange={(e) => setSelectedPresetId(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <option value="">{t('settings.chat.choosePrompt')}</option>
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
                  {t('settings.chat.use')}
                </button>
                <button className="btn-ghost btn-sm" onClick={() => setPresetMode('save')}>
                  {t('settings.chat.saveCurrent')}
                </button>
                {selectedPreset && (
                  <>
                    <IconButton
                      title={t('settings.chat.renamePrompt')}
                      onClick={() => {
                        setPresetName(selectedPreset.name);
                        setPresetMode('rename');
                      }}
                    >
                      <PencilSquareIcon className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                      title={t('settings.chat.deletePromptButton')}
                      onClick={() => setPresetMode('delete')}
                    >
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
            label={t('settings.chat.timestamps')}
            description={t('settings.chat.timestampsHint')}
          />
        </SettingsSection>,
      )}

      {renderSection('chat', 'memory', <MemorySettings />)}

      {renderSection(
        'chat',
        'reasoning',
        <SettingsSection title={t('settings.section.reasoning')}>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="field__label" htmlFor="settings-reasoning-effort">
                {t('effort.title')}
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
                <option value="">{t('settings.chat.modelDefault')}</option>
                {EFFORTS.map((effort) => (
                  <option key={effort} value={effort}>
                    {t(`effort.${effort}`)}
                  </option>
                ))}
              </select>
              <div className="field__hint">{t('settings.chat.effortHint')}</div>
            </div>
            <div className="space-y-1">
              <label className="field__label" htmlFor="settings-reasoning-tokens">
                {t('settings.chat.budget')}
              </label>
              <input
                id="settings-reasoning-tokens"
                className="input w-full"
                inputMode="numeric"
                placeholder={t('settings.chat.automatic')}
                value={reasoningTokensStr}
                aria-invalid={tokensInvalid || undefined}
                aria-describedby="settings-reasoning-tokens-hint"
                onChange={(e) => {
                  setReasoningTokensStr(e.target.value);
                  setTokensInvalid(false);
                }}
                onBlur={() => {
                  const value = reasoningTokensStr.trim();
                  if (value === '') {
                    setReasoningTokens(undefined);
                    return;
                  }
                  // A request ignores anything but a positive whole number, so
                  // saving one would change nothing and say it had.
                  const parsed = Number(value);
                  if (!Number.isInteger(parsed) || parsed < 1) {
                    setTokensInvalid(true);
                    return;
                  }
                  setReasoningTokens(parsed);
                }}
                onKeyDown={(e) => e.stopPropagation()}
              />
              <div
                id="settings-reasoning-tokens-hint"
                className="field__hint"
                role={tokensInvalid ? 'alert' : undefined}
              >
                {t(tokensInvalid ? 'settings.chat.budgetInvalid' : 'settings.chat.budgetHint')}
              </div>
            </div>
          </div>
        </SettingsSection>,
      )}
    </>
  );
}

/** Memory on or off everywhere, said plainly, with the way into the Memory page. */
function MemorySettings() {
  const t = useT();
  const enabled = useChatStore((s) => s.ui.memoryEnabled !== false);
  const sensitive = useChatStore((s) => s.ui.memorySensitive !== false);
  const setUI = useChatStore((s) => s.setUI);
  return (
    <SettingsSection title={t('settings.section.memory')}>
      <ToggleSwitch
        checked={enabled}
        onChange={(on) => setUI({ memoryEnabled: on })}
        label={t('settings.memory.use')}
        description={t('settings.memory.useHint')}
      />
      <ToggleSwitch
        checked={sensitive}
        disabled={!enabled}
        onChange={(on) => setUI({ memorySensitive: on })}
        label={t('settings.memory.sensitive')}
        description={t('settings.memory.sensitiveHint')}
      />
      <div>
        <button
          type="button"
          className="btn-outline btn-sm"
          onClick={() => setUI({ showSettings: false, memoryOpen: true })}
        >
          {t('settings.memory.open')}
        </button>
      </div>
    </SettingsSection>
  );
}
