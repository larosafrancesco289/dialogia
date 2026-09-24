import { useRef, type KeyboardEvent } from 'react';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { SunIcon, MoonIcon, ComputerDesktopIcon } from '@heroicons/react/24/outline';
import { useThemeMode, type ThemeMode } from '@/lib/hooks/useThemeMode';
import type { RenderSection } from '@/components/settings/types';
import { indexForKey } from '@/lib/ui/focus';

const SCHEMES = [
  { mode: 'light', label: 'Light', Icon: SunIcon },
  { mode: 'dark', label: 'Dark', Icon: MoonIcon },
  { mode: 'auto', label: 'Auto', Icon: ComputerDesktopIcon },
] as const satisfies ReadonlyArray<{ mode: ThemeMode; label: string; Icon: unknown }>;

type AppearancePanelProps = {
  renderSection: RenderSection;
  // Display settings
  showThinking: boolean;
  showStats: boolean;
  setShowThinking: (v: boolean) => void;
  setShowStats: (v: boolean) => void;
  onShowIntro: () => void;
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
    onShowIntro,
    showToolCallLog,
    setShowToolCallLog,
    debugMode,
    setDebugMode,
    showDebugRawJson,
    setShowDebugRawJson,
  } = props;

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
        <SettingsSection title="Theme">
          <div className="settings-row">
            <div className="settings-row-label">
              <div className="settings-row-label-text">Color scheme</div>
              <div className="settings-row-label-description">
                Light, dark, or following your system.
              </div>
            </div>
            <div className="settings-row-control">
              <div className="segmented" role="radiogroup" aria-label="Color scheme">
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
                    className={`segment inline-flex items-center gap-1.5${themeMode === mode ? ' is-active' : ''}`}
                    onClick={() => setThemeMode(mode)}
                    onKeyDown={(event) => onSchemeKeyDown(event, index)}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </SettingsSection>,
      )}

      {renderSection(
        'appearance',
        'display',
        <SettingsSection title="Display">
          <ToggleSwitch
            checked={showThinking}
            onChange={setShowThinking}
            label="Show thinking by default"
            description="Expand the reasoning panel automatically for new messages."
          />
          <ToggleSwitch
            checked={showStats}
            onChange={setShowStats}
            label="Show the colophon"
            description="A line under each reply: which model wrote it, how fast, and what it cost."
          />
          <div className="settings-row">
            <div className="settings-row-label">
              <div className="settings-row-label-text">The introduction</div>
              <div className="settings-row-label-description">
                The short tour from your first visit.
              </div>
            </div>
            <div className="settings-row-control">
              <button
                type="button"
                className="btn-ghost btn-sm"
                aria-label="Show the introduction again"
                onClick={onShowIntro}
              >
                Show again
              </button>
            </div>
          </div>
        </SettingsSection>,
      )}

      {renderSection(
        'appearance',
        'developer',
        <SettingsSection title="Developer">
          <ToggleSwitch
            checked={showToolCallLog}
            onChange={setShowToolCallLog}
            label="Tool-call log"
            description="Above each reply that used tools, every call with its arguments and result."
          />
          <ToggleSwitch
            checked={debugMode}
            onChange={setDebugMode}
            label="Request view"
            description="Above each reply, the request that produced it. Captured from now on and kept until you reload."
          />
          <ToggleSwitch
            checked={showDebugRawJson}
            onChange={setShowDebugRawJson}
            disabled={!debugMode}
            label="Include the raw JSON"
            description="The request exactly as sent, ready to copy."
          />
        </SettingsSection>,
      )}
    </>
  );
}
