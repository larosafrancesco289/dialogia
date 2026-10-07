import { useRef, type KeyboardEvent } from 'react';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { SunIcon, MoonIcon, ComputerDesktopIcon } from '@heroicons/react/24/outline';
import { useThemeMode, type ThemeMode } from '@/lib/hooks/useThemeMode';
import type { RenderSection } from '@/components/settings/types';
import { indexForKey } from '@/lib/ui/focus';
import { cn } from '@/lib/ui/cn';
import { useT, type MessageKey } from '@/lib/i18n';
import { isLanguagePreference, LOCALES, nativeName, resolveLanguage } from '@/lib/i18n/locales';
import { useChatStore } from '@/lib/store';

const SCHEMES = [
  { mode: 'light', label: 'appearance.light', Icon: SunIcon },
  { mode: 'dark', label: 'appearance.dark', Icon: MoonIcon },
  { mode: 'auto', label: 'appearance.auto', Icon: ComputerDesktopIcon },
] as const satisfies ReadonlyArray<{ mode: ThemeMode; label: MessageKey; Icon: unknown }>;

/**
 * The app's language. Each is offered in its own words, so it can be found by
 * someone who reads none of the others; Auto says which one it chose.
 */
function LanguageSetting() {
  const t = useT();
  const preference = useChatStore((s) => s.ui.language ?? 'auto');
  const setUI = useChatStore((s) => s.setUI);
  return (
    <div className="settings-row">
      <div className="settings-row-label">
        <label className="settings-row-label-text" htmlFor="settings-language">
          {t('appearance.language')}
        </label>
        <div className="settings-row-label-description">{t('appearance.languageHint')}</div>
      </div>
      <div className="settings-row-control">
        <select
          id="settings-language"
          className="input"
          value={preference}
          onChange={(event) => {
            const value = event.target.value;
            if (isLanguagePreference(value)) setUI({ language: value });
          }}
        >
          <option value="auto">
            {t('appearance.languageAuto', {
              language: nativeName(resolveLanguage('auto')),
            })}
          </option>
          {LOCALES.map(({ code, name }) => (
            <option key={code} value={code} lang={code}>
              {name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

type AppearancePanelProps = {
  renderSection: RenderSection;
  // Display settings
  showThinking: boolean;
  showStats: boolean;
  setShowThinking: (v: boolean) => void;
  setShowStats: (v: boolean) => void;
  // Developer
  showToolCallLog: boolean;
  setShowToolCallLog: (v: boolean) => void;
  debugMode: boolean;
  setDebugMode: (v: boolean) => void;
  showDebugRawJson: boolean;
  setShowDebugRawJson: (v: boolean) => void;
};

export function AppearancePanel(props: AppearancePanelProps) {
  const {
    renderSection,
    showThinking,
    showStats,
    setShowThinking,
    setShowStats,
    showToolCallLog,
    setShowToolCallLog,
    debugMode,
    setDebugMode,
    showDebugRawJson,
    setShowDebugRawJson,
  } = props;

  const t = useT();
  // Shared theme state — stays in sync with the header and mobile toggles
  const [themeMode, setThemeMode] = useThemeMode();
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // One Tab stop for the group; the arrows move the choice, as radios do.
  const onSchemeKeyDown = (event: KeyboardEvent, index: number) => {
    const next = indexForKey(event.key, index, SCHEMES.length, 'both');
    if (next === null) return;
    event.preventDefault();
    setThemeMode(SCHEMES[next].mode);
    optionRefs.current[next]?.focus();
  };

  return (
    <>
      {renderSection(
        'appearance',
        'theme',
        <SettingsSection title={t('settings.section.theme')}>
          <div className="settings-row">
            <div className="settings-row-label">
              <div className="settings-row-label-text">{t('appearance.scheme')}</div>
              <div className="settings-row-label-description">{t('appearance.schemeHint')}</div>
            </div>
            <div className="settings-row-control">
              <div className="segmented" role="radiogroup" aria-label={t('appearance.scheme')}>
                {SCHEMES.map(({ mode, label, Icon }, index) => (
                  <button
                    key={mode}
                    ref={(el) => {
                      optionRefs.current[index] = el;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={themeMode === mode}
                    tabIndex={themeMode === mode ? 0 : -1}
                    className={cn(
                      'segment inline-flex items-center gap-1.5',
                      themeMode === mode && 'is-active',
                    )}
                    onClick={() => setThemeMode(mode)}
                    onKeyDown={(event) => onSchemeKeyDown(event, index)}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {t(label)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </SettingsSection>,
      )}

      {renderSection(
        'appearance',
        'language',
        <SettingsSection title={t('settings.section.language')}>
          <LanguageSetting />
        </SettingsSection>,
      )}

      {renderSection(
        'appearance',
        'display',
        <SettingsSection title={t('settings.section.display')}>
          <ToggleSwitch
            checked={showThinking}
            onChange={setShowThinking}
            label={t('appearance.showThinking')}
            description={t('appearance.showThinkingHint')}
          />
          <ToggleSwitch
            checked={showStats}
            onChange={setShowStats}
            label={t('appearance.showStats')}
            description={t('appearance.showStatsHint')}
          />
        </SettingsSection>,
      )}

      {renderSection(
        'appearance',
        'developer',
        <SettingsSection title={t('settings.section.developer')}>
          <ToggleSwitch
            checked={showToolCallLog}
            onChange={setShowToolCallLog}
            label={t('appearance.toolLog')}
            description={t('appearance.toolLogHint')}
          />
          <ToggleSwitch
            checked={debugMode}
            onChange={setDebugMode}
            label={t('appearance.requestView')}
            description={t('appearance.requestViewHint')}
          />
          <ToggleSwitch
            checked={showDebugRawJson}
            onChange={setShowDebugRawJson}
            disabled={!debugMode}
            label={t('appearance.rawJson')}
            description={t('appearance.rawJsonHint')}
          />
        </SettingsSection>,
      )}
    </>
  );
}
