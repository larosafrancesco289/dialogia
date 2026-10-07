import type { RefObject } from 'react';
import { XMarkIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import type { DraftAttachment } from '@/lib/types';
import { neighbourOf, refocusIfDropped } from '@/lib/ui/focus';
import { useT, type Translate } from '@/lib/i18n';

export type AttachmentPreviewListProps = {
  attachments: DraftAttachment[];
  onRemove: (id: string) => void;
  /** Takes focus once the last attachment goes. */
  fieldRef?: RefObject<HTMLElement>;
};

export function AttachmentPreviewList({
  attachments,
  onRemove,
  fieldRef,
}: AttachmentPreviewListProps) {
  const t = useT();
  if (!attachments.length) return null;

  return (
    <div className="composer-attachments">
      {attachments.map((attachment) => (
        <div key={attachment.id} className="relative">
          {renderPreview(t, attachment)}
          <button
            type="button"
            className="attachment-remove"
            aria-label={t('attachments.removeNamed', {
              name: attachment.name || t('attachments.attachment'),
            })}
            title={t('attachments.remove')}
            onClick={(event) => {
              // Focus goes to the next chip's ×, else the one before, else the field.
              const button = event.currentTarget;
              const buttons = Array.from(
                button.closest('.composer-attachments')?.querySelectorAll('.attachment-remove') ??
                  [],
              );
              const neighbour = neighbourOf(buttons, button);
              onRemove(attachment.id);
              refocusIfDropped(
                () => neighbour,
                () => fieldRef?.current,
              );
            }}
          >
            <XMarkIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

function renderPreview(t: Translate, attachment: DraftAttachment) {
  if (attachment.kind === 'image' && attachment.dataURL) {
    return (
      <img
        src={attachment.dataURL}
        alt={attachment.name || t('attachments.attachment')}
        width={64}
        height={64}
        loading="lazy"
        decoding="async"
        className="attachment-thumb h-16 w-16 object-cover"
      />
    );
  }

  if (attachment.kind === 'audio' && attachment.dataURL) {
    return (
      <div className="h-16 min-w-40 sm:min-w-48 max-w-72 px-3 py-2 attachment-chip flex items-center gap-2">
        <audio controls preload="none" src={attachment.dataURL} className="h-10" />
        <div className="min-w-0">
          <div
            className="text-xs font-medium truncate"
            title={attachment.name || t('attachments.audio')}
          >
            {attachment.name || t('attachments.audio')}
          </div>
          <div className="text-[11px] text-fg-muted">{t('attachments.attachedAudio')}</div>
        </div>
      </div>
    );
  }

  return <PdfChip name={attachment.name} detail={t('attachments.attachedPdf')} />;
}

/** A PDF as a chip: the document glyph, its name, and a line under it. */
export function PdfChip({ name, detail }: { name?: string; detail: string }) {
  return (
    <div className="h-16 min-w-40 max-w-64 px-3 py-2 attachment-chip flex items-center gap-2">
      <DocumentTextIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <div className="text-xs font-medium truncate" title={name || 'PDF'}>
          {name || 'PDF'}
        </div>
        <div className="text-[11px] text-fg-muted">{detail}</div>
      </div>
    </div>
  );
}
