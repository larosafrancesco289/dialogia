import type { Attachment } from '@/lib/types';

export type MessageAttachmentsProps = {
  attachments: Attachment[];
  onOpenLightbox?: (
    value: {
      images: { src: string; name?: string }[];
      index: number;
    } | null,
  ) => void;
  variant?: 'default' | 'compact';
};

const containerByVariant: Record<'default' | 'compact', string> = {
  default: 'px-4 pt-2 flex flex-wrap gap-2',
  compact: 'px-3 pt-1.5 flex flex-wrap gap-1.5',
};

const imageSizeByVariant: Record<'default' | 'compact', string> = {
  default: 'h-28 w-28 sm:h-36 sm:w-36',
  compact: 'h-24 w-24 sm:h-32 sm:w-32',
};

const audioSizeByVariant: Record<'default' | 'compact', string> = {
  default: 'h-16 min-w-40 sm:min-w-48 max-w-72 px-3 py-2',
  compact: 'h-14 min-w-36 sm:min-w-40 max-w-64 px-2.5 py-1.5',
};

export function MessageAttachments({
  attachments,
  onOpenLightbox,
  variant = 'default',
}: MessageAttachmentsProps) {
  if (!Array.isArray(attachments) || attachments.length === 0) return null;

  const imageAttachments = attachments.filter((item) => item.kind === 'image');
  const audioAttachments = attachments.filter((item) => item.kind === 'audio');
  const pdfAttachments = attachments.filter((item) => item.kind === 'pdf');

  const handleOpenLightbox = (index: number, array: Attachment[]) => {
    if (!onOpenLightbox) return;
    const images = array
      .filter((item) => item.kind === 'image' && typeof item.dataURL === 'string')
      .map((item) => ({ src: item.dataURL as string, name: item.name }));
    if (images.length === 0) return;
    onOpenLightbox({ images, index });
  };

  return (
    <div className={containerByVariant[variant]}>
      {imageAttachments.map((attachment, index, array) => (
        <button
          key={attachment.id}
          className="p-0 m-0 border-none bg-transparent"
          onClick={() => handleOpenLightbox(index, array)}
          title="Click to enlarge"
          type="button"
        >
          <img
            src={attachment.dataURL}
            alt={attachment.name || 'image'}
            className={`${imageSizeByVariant[variant]} object-cover rounded border border-border`}
          />
        </button>
      ))}
      {audioAttachments.map((attachment) => (
        <div
          key={attachment.id}
          className={`${audioSizeByVariant[variant]} rounded border border-border bg-muted/50 flex items-center gap-2`}
        >
          {attachment.dataURL ? (
            <audio controls src={attachment.dataURL} className="h-10" />
          ) : (
            <span className="text-xs">Audio attached</span>
          )}
          <div className="min-w-0">
            <div className="text-xs font-medium truncate" title={attachment.name || 'Audio'}>
              {attachment.name || 'Audio'}
            </div>
          </div>
        </div>
      ))}
      {pdfAttachments.map((attachment) => (
        <span
          key={attachment.id}
          className="badge"
          title={`${attachment.name || 'PDF'}${attachment.pageCount ? ` • ${attachment.pageCount} pages` : ''}`}
        >
          {attachment.name || 'PDF'}
          {attachment.pageCount ? ` (${attachment.pageCount}p)` : ''}
        </span>
      ))}
    </div>
  );
}
