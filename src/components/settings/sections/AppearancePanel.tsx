import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
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
  // Privacy settings
  zdrOnly: boolean | undefined;
  setZdrOnly: (v: boolean) => void;
  reloadModels: () => void;
};

export function AppearancePanel(props: AppearancePanelProps) {
  const {
    renderSection,
    showThinking,
    showStats,
    setShowThinking,
    setShowStats,
    zdrOnly,
    setZdrOnly,
    reloadModels,
  } = props;

  // Shared theme state — stays in sync with the header and mobile toggles
  const [themeMode, setThemeMode] = useThemeMode();

  const handleThemeChange = (mode: ThemeMode) => {
    setThemeMode(mode);
  };

  return (
    <>
      {renderSection(
        'appearance',
        'display',
        <div className="settings-section">
          <div className="settings-section-header">Display</div>
          <div className="settings-section-content">
            <ToggleSwitch
              checked={showThinking}
              onChange={setShowThinking}
              label="Show thinking by default"
              description="Expand the reasoning panel automatically for new messages."
            />
            <ToggleSwitch
              checked={showStats}
              onChange={setShowStats}
              label="Show stats"
              description="Display model, timing, and cost info under messages."
            />
          </div>
        </div>,
      )}

      {renderSection(
        'appearance',
        'theme',
        <div className="settings-section">
          <div className="settings-section-header">Theme</div>
          <div className="settings-section-content">
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
          </div>
        </div>,
      )}

      {renderSection(
        'appearance',
        'privacy',
        <div className="settings-section">
          <div className="settings-section-header">Privacy</div>
          <div className="settings-section-content">
            <ToggleSwitch
              checked={zdrOnly === true}
              onChange={(checked) => {
                setZdrOnly(checked);
                reloadModels();
              }}
              label="Zero Data Retention (ZDR) only"
              description="Only show models from providers that don't store your data."
            />
          </div>
        </div>,
      )}
    </>
  );
}
