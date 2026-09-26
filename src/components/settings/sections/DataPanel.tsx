import { useState } from 'react';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { RenderSection } from '@/components/settings/types';

type DataPanelProps = {
  renderSection: RenderSection;
  onExport: () => Promise<void> | void;
  onImportPicked: (file?: File | null) => Promise<void> | void;
};

/** Data: every chat and setting as one JSON file, out and back in. */
export function DataPanel({ renderSection, onExport, onImportPicked }: DataPanelProps) {
  // An import writes over chats and settings with the same ids, and cannot be
  // undone, so a picked file is named and confirmed first.
  const [pending, setPending] = useState<File | null>(null);
  return (
    <>
      {renderSection(
        'data',
        'data',
        <SettingsSection title="Import and export">
          <div className="settings-row">
            <div className="settings-row-label">
              <div className="settings-row-label-text">Chats and settings</div>
              <div className="settings-row-label-description">
                Everything as one JSON file. Keys are never included.
              </div>
            </div>
            <div className="settings-row-control flex gap-2">
              <label className="btn-outline btn-sm cursor-pointer">
                Import
                <input
                  type="file"
                  accept="application/json"
                  className="sr-only"
                  onChange={(e) => {
                    setPending(e.target.files?.[0] ?? null);
                    e.target.value = '';
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
      <ConfirmDialog
        open={!!pending}
        title={`Import ${pending?.name ?? 'this file'}?`}
        description="Chats in the file replace chats here with the same id, and its settings replace yours: servers, favorites and chat defaults. Everything else here is kept. Export first if you may want to go back."
        confirmLabel="Import"
        tone="default"
        onConfirm={() => {
          const file = pending;
          setPending(null);
          void onImportPicked(file);
        }}
        onCancel={() => setPending(null)}
      />
    </>
  );
}
