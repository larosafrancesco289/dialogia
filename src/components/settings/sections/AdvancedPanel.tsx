'use client';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import type { RenderSection } from '@/components/settings/types';

type AdvancedPanelProps = {
  renderSection: RenderSection;
  // Data
  onExport: () => Promise<void> | void;
  onImportPicked: (file?: File | null) => Promise<void> | void;
};

export function AdvancedPanel(props: AdvancedPanelProps) {
  const { renderSection, onExport, onImportPicked } = props;

  return (
    <>
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
    </>
  );
}
