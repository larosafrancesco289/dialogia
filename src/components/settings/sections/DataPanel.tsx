import { SettingsSection } from '@/components/settings/SettingsSection';
import type { RenderSection } from '@/components/settings/types';

type DataPanelProps = {
  renderSection: RenderSection;
  onExport: () => Promise<void> | void;
  onImportPicked: (file?: File | null) => Promise<void> | void;
};

/** Data: every chat and setting as one JSON file, out and back in. */
export function DataPanel({ renderSection, onExport, onImportPicked }: DataPanelProps) {
  return (
    <>
      {renderSection(
        'data',
        'data',
        <SettingsSection title="Import and export">
          <div className="settings-row">
            <div className="settings-row-label">
              <div className="settings-row-label-text">Your library</div>
              <div className="settings-row-label-description">
                All chats and settings as one JSON file. Keys are never included.
              </div>
            </div>
            <div className="settings-row-control flex gap-2">
              <label className="btn-outline btn-sm cursor-pointer">
                Import
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
              <button className="btn-outline btn-sm" onClick={() => onExport()}>
                Export
              </button>
            </div>
          </div>
        </SettingsSection>,
      )}
    </>
  );
}
