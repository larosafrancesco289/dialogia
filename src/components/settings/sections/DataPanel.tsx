import { useState } from 'react';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { RenderSection } from '@/components/settings/types';
import { useT } from '@/lib/i18n';

type DataPanelProps = {
  renderSection: RenderSection;
  onExport: () => Promise<void> | void;
  onImportPicked: (file?: File | null) => Promise<void> | void;
};

/** Data: every chat and setting as one JSON file, out and back in. */
export function DataPanel({ renderSection, onExport, onImportPicked }: DataPanelProps) {
  // An import writes over chats and settings with the same ids, and cannot be
  // undone, so a picked file is named and confirmed first.
  const t = useT();
  const [pending, setPending] = useState<File | null>(null);
  return (
    <>
      {renderSection(
        'data',
        'data',
        <SettingsSection title={t('settings.section.data')}>
          <div className="settings-row">
            <div className="settings-row-label">
              <div className="settings-row-label-text">{t('data.label')}</div>
              <div className="settings-row-label-description">{t('data.hint')}</div>
            </div>
            <div className="settings-row-control flex gap-2">
              <label className="btn-outline btn-sm cursor-pointer">
                {t('data.import')}
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
                {t('data.export')}
              </button>
            </div>
          </div>
        </SettingsSection>,
      )}
      <ConfirmDialog
        open={!!pending}
        title={t('data.importTitle', { name: pending?.name ?? t('data.thisFile') })}
        description={t('data.importBody')}
        confirmLabel={t('data.import')}
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
