'use client';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import { UsageStatsPanel } from '@/components/settings/sections/UsageStatsPanel';
import { VoicePanel } from '@/components/settings/sections/VoicePanel';
import type { StoreState } from '@/lib/store/types';
import type { RenderSection } from '@/components/settings/types';

type AdvancedPanelProps = {
  renderSection: RenderSection;
  // Data
  onExport: () => Promise<void> | void;
  onImportPicked: (file?: File | null) => Promise<void> | void;
  // Labs
  experimentalBrave: boolean;
  setUI: (ui: Partial<StoreState['ui']>) => void;
  // Debug
  uiDebugMode: boolean;
  showToolCallLog: boolean;
  showDebugRawJson: boolean;
  setDebugMode: (v: boolean) => void;
  setShowToolCallLog: (v: boolean) => void;
  setShowDebugRawJson: (v: boolean) => void;
};

export function AdvancedPanel(props: AdvancedPanelProps) {
  const {
    renderSection,
    onExport,
    onImportPicked,
    experimentalBrave,
    setUI,
    uiDebugMode,
    showToolCallLog,
    showDebugRawJson,
    setDebugMode,
    setShowToolCallLog,
    setShowDebugRawJson,
  } = props;

  return (
    <>
      {renderSection(
        'advanced',
        'usage-stats',
        <div className="settings-section">
          <div className="settings-section-header">Usage Statistics</div>
          <div className="settings-section-content">
            <UsageStatsPanel />
          </div>
        </div>,
      )}

      {renderSection(
        'advanced',
        'data',
        <div className="settings-section">
          <div className="settings-section-header">Data</div>
          <div className="settings-section-content">
            <CollapsibleSection title="Import & Export" defaultOpen={false}>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <button className="btn" onClick={() => onExport()}>
                    Export all
                  </button>
                  <label className="btn btn-outline cursor-pointer">
                    Import JSON
                    <input
                      type="file"
                      accept="application/json"
                      className="sr-only"
                      onChange={async (e) => {
                        const f = e.target.files?.[0] || null;
                        await onImportPicked(f ?? null);
                        if (e.target) (e.target as HTMLInputElement).value = '';
                      }}
                    />
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Export or import your chats and settings as a JSON file.
                </p>
              </div>
            </CollapsibleSection>
          </div>
        </div>,
      )}

      {renderSection(
        'advanced',
        'experimental',
        <div className="settings-section">
          <div className="settings-section-header">Experimental</div>
          <div className="settings-section-content">
            <ToggleSwitch
              checked={experimentalBrave}
              onChange={(checked) => setUI({ flags: { experimentalBrave: checked } })}
              label="Brave Web Search"
              description="Toggle Brave integration for web search and sources panel."
            />

            <CollapsibleSection title="Debug Options" defaultOpen={false}>
              <div className="space-y-4">
                <ToggleSwitch
                  checked={uiDebugMode}
                  onChange={setDebugMode}
                  label="Enable debug view"
                  description="Show a Debug panel under assistant messages with the exact request payload."
                />
                <ToggleSwitch
                  checked={showToolCallLog}
                  onChange={setShowToolCallLog}
                  label="Show tool call log"
                  description="Include structured tool activity inside the debug panel."
                />
                <ToggleSwitch
                  checked={showDebugRawJson}
                  onChange={setShowDebugRawJson}
                  label="Show raw debug JSON"
                  description="When off, hide the raw request JSON block to keep debug concise."
                />
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Voice Settings" defaultOpen={false}>
              <VoicePanel />
            </CollapsibleSection>
          </div>
        </div>,
      )}
    </>
  );
}
