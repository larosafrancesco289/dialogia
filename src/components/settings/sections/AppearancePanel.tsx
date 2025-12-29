'use client';
import { useEffect, useState } from 'react';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { SunIcon, MoonIcon, ComputerDesktopIcon } from '@heroicons/react/24/outline';
import { applyTheme, type ThemeMode } from '@/components/ThemeToggle';
import type { RenderSection } from '@/components/settings/types';

type AppearancePanelProps = {
  renderSection: RenderSection;
  // Display settings
  showThinking: boolean;
  showStats: boolean;
  showToolCallLog: boolean;
  showDebugRawJson: boolean;
  enableMultiModelChat: boolean;
  uiDebugMode: boolean;
  setShowThinking: (v: boolean) => void;
  setShowStats: (v: boolean) => void;
  setShowToolCallLog: (v: boolean) => void;
  setShowDebugRawJson: (v: boolean) => void;
  setEnableMultiModelChat: (v: boolean) => void;
  setDebugMode: (v: boolean) => void;
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
    showToolCallLog,
    showDebugRawJson,
    enableMultiModelChat,
    uiDebugMode,
    setShowThinking,
    setShowStats,
    setShowToolCallLog,
    setShowDebugRawJson,
    setEnableMultiModelChat,
    setDebugMode,
    zdrOnly,
    setZdrOnly,
    reloadModels,
  } = props;

  // Theme state
  const [themeMode, setThemeMode] = useState<ThemeMode>('auto');

  useEffect(() => {
    const saved = (localStorage.getItem('theme') as ThemeMode | null) ?? 'auto';
    setThemeMode(saved);
  }, []);

  const handleThemeChange = (mode: ThemeMode) => {
    setThemeMode(mode);
    localStorage.setItem('theme', mode);
    applyTheme(mode);
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
            <ToggleSwitch
              checked={enableMultiModelChat}
              onChange={setEnableMultiModelChat}
              label="Multi-model chat"
              description="Allow selecting and chatting with multiple models simultaneously."
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
                  Choose between light, dark, or automatic based on system preference.
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg border transition-colors ${
                  themeMode === 'light'
                    ? 'bg-muted border-accent text-foreground'
                    : 'border-border text-muted-foreground hover:bg-muted/50'
                }`}
                onClick={() => handleThemeChange('light')}
              >
                <SunIcon className="h-5 w-5" />
                <span className="text-sm font-medium">Light</span>
              </button>
              <button
                type="button"
                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg border transition-colors ${
                  themeMode === 'dark'
                    ? 'bg-muted border-accent text-foreground'
                    : 'border-border text-muted-foreground hover:bg-muted/50'
                }`}
                onClick={() => handleThemeChange('dark')}
              >
                <MoonIcon className="h-5 w-5" />
                <span className="text-sm font-medium">Dark</span>
              </button>
              <button
                type="button"
                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg border transition-colors ${
                  themeMode === 'auto'
                    ? 'bg-muted border-accent text-foreground'
                    : 'border-border text-muted-foreground hover:bg-muted/50'
                }`}
                onClick={() => handleThemeChange('auto')}
              >
                <ComputerDesktopIcon className="h-5 w-5" />
                <span className="text-sm font-medium">Auto</span>
              </button>
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
