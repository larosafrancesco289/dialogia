'use client';
import { XMarkIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import type { Attachment } from '@/lib/types';

export type AttachmentPreviewListProps = {
  attachments: Attachment[];
  onRemove: (id: string) => void;
  className?: string;
};

export function AttachmentPreviewList({
  attachments,
  onRemove,
  className,
}: AttachmentPreviewListProps) {
  if (!attachments.length) return null;

  return (
    <div className={className ?? 'mb-2 flex flex-wrap gap-2'}>
      {attachments.map((attachment) => (
        <div key={attachment.id} className="relative">
          {renderPreview(attachment)}
          <button
            type="button"
            className="absolute -top-2 -right-2 bg-surface rounded-full border border-border p-1 shadow"
            aria-label="Remove attachment"
            title="Remove"
            onClick={() => onRemove(attachment.id)}
          >
            <XMarkIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

function renderPreview(attachment: Attachment) {
  if (attachment.kind === 'image' && attachment.dataURL) {
    return (
      <img
        src={attachment.dataURL}
        alt={attachment.name || 'attachment'}
        className="h-16 w-16 object-cover rounded border border-border"
      />
    );
  }

  if (attachment.kind === 'audio' && attachment.dataURL) {
    return (
      <div className="h-16 min-w-40 sm:min-w-48 max-w-72 px-3 py-2 rounded border border-border bg-muted/50 flex items-center gap-2">
        <audio controls src={attachment.dataURL} className="h-10" />
        <div className="min-w-0">
          <div className="text-xs font-medium truncate" title={attachment.name || 'Audio'}>
            {attachment.name || 'Audio'}
          </div>
          <div className="text-[11px] text-muted-foreground">Attached (mp3/wav)</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-16 min-w-40 max-w-64 px-3 py-2 rounded border border-border bg-muted/50 flex items-center gap-2">
      <DocumentTextIcon className="h-5 w-5" />
      <div className="min-w-0">
        <div className="text-xs font-medium truncate" title={attachment.name || 'PDF'}>
          {attachment.name || 'PDF'}
        </div>
        <div className="text-[11px] text-muted-foreground">Attached (parsed by OpenRouter)</div>
      </div>
    </div>
  );
}
