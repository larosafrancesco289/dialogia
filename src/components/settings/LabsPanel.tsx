'use client';
import type { ReactNode } from 'react';
import SettingsSection from '@/components/settings/SettingsSection';
import type { StoreState } from '@/lib/store/types';
import type { RenderSection } from '@/components/settings/types';

type LabsPanelProps = {
  renderSection: RenderSection;
  experimentalBrave: boolean;
  experimentalDeepResearch: boolean;
  setUI: (ui: Partial<StoreState['ui']>) => void;
};

export default function LabsPanel(props: LabsPanelProps) {
  const { renderSection, experimentalBrave, experimentalDeepResearch, setUI } = props;

  return (
    <>
      {renderSection(
        'labs',
        'experimental',
        <SettingsSection title="Experimental">
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm block">Brave Web Search</label>
              <div className="segmented">
                <button
                  className={`segment ${experimentalBrave ? 'is-active' : ''}`}
                  onClick={() => setUI({ experimentalBrave: true })}
                >
                  On
                </button>
                <button
                  className={`segment ${!experimentalBrave ? 'is-active' : ''}`}
                  onClick={() => setUI({ experimentalBrave: false })}
                >
                  Off
                </button>
              </div>
              <div className="text-xs text-muted-foreground">
                Toggle Brave integration for web search and sources panel.
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm block">DeepResearch</label>
              <div className="segmented">
                <button
                  className={`segment ${experimentalDeepResearch ? 'is-active' : ''}`}
                  onClick={() => setUI({ experimentalDeepResearch: true })}
                >
                  On
                </button>
                <button
                  className={`segment ${!experimentalDeepResearch ? 'is-active' : ''}`}
                  onClick={() => setUI({ experimentalDeepResearch: false })}
                >
                  Off
                </button>
              </div>
              <div className="text-xs text-muted-foreground">
                Show the DeepResearch toggle in the composer and enable multi-step research.
              </div>
            </div>
          </div>
        </SettingsSection>,
      )}
    </>
  );
}
