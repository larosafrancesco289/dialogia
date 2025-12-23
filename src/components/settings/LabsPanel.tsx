'use client';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { VoicePanel } from '@/components/settings/VoicePanel';
import type { StoreState } from '@/lib/store/types';
import type { RenderSection } from '@/components/settings/types';

type LabsPanelProps = {
  renderSection: RenderSection;
  experimentalBrave: boolean;
  setUI: (ui: Partial<StoreState['ui']>) => void;
};

export function LabsPanel(props: LabsPanelProps) {
  const { renderSection, experimentalBrave, setUI } = props;

  return (
    <>
      {renderSection(
        'labs',
        'experimental',
        <>
          <SettingsSection title="Experimental">
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm block">Brave Web Search</label>
                <div className="segmented">
                  <button
                    className={`segment ${experimentalBrave ? 'is-active' : ''}`}
                    onClick={() => setUI({ flags: { experimentalBrave: true } })}
                  >
                    On
                  </button>
                  <button
                    className={`segment ${!experimentalBrave ? 'is-active' : ''}`}
                    onClick={() => setUI({ flags: { experimentalBrave: false } })}
                  >
                    Off
                  </button>
                </div>
                <div className="text-xs text-muted-foreground">
                  Toggle Brave integration for web search and sources panel.
                </div>
              </div>
            </div>
          </SettingsSection>
          <VoicePanel />
        </>,
      )}
    </>
  );
}
