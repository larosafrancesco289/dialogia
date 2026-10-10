import { SettingsSection } from '@/components/settings/SettingsSection';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { RenderSection } from '@/components/settings/types';
import type { ImportProgress } from '@/lib/historyImport/importHistory';
import type { ImportReview } from '@/lib/settings/transfer';
import { SOURCE_NAMES } from '@/lib/historyImport/parse';
import { useT } from '@/lib/i18n';

export type ImportKind = 'backup' | 'history';

/** A file read and checked, shown to the person before it is applied. */
export type PendingImport = { name: string; kind: ImportKind; review: ImportReview };

/** Notes listed in the question before the rest are only counted. */
const NOTES_SHOWN = 8;

type DataPanelProps = {
  renderSection: RenderSection;
  onExport: () => Promise<void> | void;
  onImportPicked: (file: File, kind: ImportKind) => Promise<void> | void;
  pendingImport: PendingImport | null;
  onConfirmImport: () => void;
  onCancelImport: () => void;
  /** What is being imported, while it is. */
  importing: ImportKind | null;
  importProgress: ImportProgress | null;
};

/**
 * Data: every chat and setting as one JSON file, out and back in; and the
 * chats of a ChatGPT or Claude data export, in.
 */
export function DataPanel({
  renderSection,
  onExport,
  onImportPicked,
  pendingImport: pending,
  onConfirmImport,
  onCancelImport,
  importing,
  importProgress,
}: DataPanelProps) {
  // An import writes over chats and settings with the same ids, and cannot be
  // undone, so a picked file is read, named, and what it would set shown,
  // before it is applied.
  const t = useT();
  const busy = !!importing;
  const picker = (kind: ImportKind, label: string, accept: string) => (
    <label
      className={`btn-outline btn-sm ${busy ? 'pointer-events-none opacity-60' : 'cursor-pointer'}`}
      aria-disabled={busy || undefined}
    >
      {label}
      <input
        type="file"
        accept={accept}
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onImportPicked(file, kind);
          e.target.value = '';
        }}
      />
    </label>
  );
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
              {picker('backup', t('data.import'), 'application/json')}
              <button className="btn-outline btn-sm" onClick={() => onExport()}>
                {t('data.export')}
              </button>
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-row-label">
              <div className="settings-row-label-text">{t('history.label')}</div>
              <div className="settings-row-label-description" role="status">
                {importProgress
                  ? t('history.progress', {
                      source: SOURCE_NAMES[importProgress.source],
                      done: importProgress.done,
                      total: importProgress.total,
                    })
                  : importing === 'history'
                    ? t('history.reading')
                    : t('history.hint')}
              </div>
            </div>
            <div className="settings-row-control">
              {picker(
                'history',
                t('history.choose'),
                '.json,.zip,application/json,application/zip',
              )}
            </div>
          </div>
        </SettingsSection>,
      )}
      <ConfirmDialog
        open={!!pending}
        title={t('data.importTitle', { name: pending?.name || t('data.thisFile') })}
        description={t(pending?.kind === 'history' ? 'history.confirmBody' : 'data.importBody')}
        confirmLabel={t('data.import')}
        tone="default"
        onConfirm={onConfirmImport}
        onCancel={onCancelImport}
      >
        {pending?.review.system && (
          <div className="dialog__review">
            {t('data.review.system')}
            <blockquote className="dialog__quote">{pending.review.system}</blockquote>
          </div>
        )}
        {!!pending?.review.notes.length && (
          <div className="dialog__review">
            {t('data.review.notes', { count: pending.review.notes.length })}
            <ul className="dialog__quote">
              {pending.review.notes.slice(0, NOTES_SHOWN).map((note, index) => (
                <li key={index}>{note}</li>
              ))}
              {pending.review.notes.length > NOTES_SHOWN && (
                <li>
                  {t('data.review.more', { count: pending.review.notes.length - NOTES_SHOWN })}
                </li>
              )}
            </ul>
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}
