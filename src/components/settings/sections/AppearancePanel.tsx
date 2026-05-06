'use client';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
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
