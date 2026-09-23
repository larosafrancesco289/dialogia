import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { SunIcon, MoonIcon, ComputerDesktopIcon } from '@heroicons/react/24/outline';
import { useThemeMode, type ThemeMode } from '@/lib/hooks/useThemeMode';
import type { RenderSection } from '@/components/settings/types';

type AppearancePanelProps = {
  renderSection: RenderSection;
  // Display settings
  showThinking: boolean;
  showStats: boolean;
  setShowThinking: (v: boolean) => void;
  setShowStats: (v: boolean) => void;
};

export function AppearancePanel(props: AppearancePanelProps) {
  const { renderSection, showThinking, showStats, setShowThinking, setShowStats } = props;

  // Shared theme state — stays in sync with the header and mobile toggles
  const [themeMode, setThemeMode] = useThemeMode();

  const handleThemeChange = (mode: ThemeMode) => {
    setThemeMode(mode);
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
                {(
                  [
                    { mode: 'light', label: 'Light', Icon: SunIcon },
                    { mode: 'dark', label: 'Dark', Icon: MoonIcon },
                    { mode: 'auto', label: 'Auto', Icon: ComputerDesktopIcon },
                  ] as const
                ).map(({ mode, label, Icon }) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={themeMode === mode}
                    className={`segment inline-flex items-center gap-1.5${themeMode === mode ? ' is-active' : ''}`}
                    onClick={() => handleThemeChange(mode)}
                  >
                    <Icon className="h-4 w-4" />
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
        </SettingsSection>,
      )}
    </>
  );
}
