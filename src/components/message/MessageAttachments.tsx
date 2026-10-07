import type { PersistedAttachment } from '@/lib/types';
import { PdfChip } from '@/components/AttachmentPreviewList';
import { useT } from '@/lib/i18n';

export type MessageAttachmentsProps = {
  attachments: PersistedAttachment[];
  onOpenLightbox?: (
    value: {
      images: { src: string; name?: string }[];
      index: number;
    } | null,
  ) => void;
  /** `user`: inside the person's own bubble, set to its edge above their words. */
  variant?: 'default' | 'user';
};

const CONTAINER = {
  default: 'px-4 pt-2 flex flex-wrap items-start gap-2',
  user: 'message-attachments--user flex flex-wrap items-start',
};

export function MessageAttachments({
  attachments,
  onOpenLightbox,
  variant = 'default',
}: MessageAttachmentsProps) {
  const t = useT();
  if (!Array.isArray(attachments) || attachments.length === 0) return null;

  const imageAttachments = attachments.filter(
    (item): item is PersistedAttachment & { dataURL: string } =>
      item.kind === 'image' && typeof item.dataURL === 'string',
  );
  const audioAttachments = attachments.filter((item) => item.kind === 'audio');
  const pdfAttachments = attachments.filter((item) => item.kind === 'pdf');

  const handleOpenLightbox = (
    index: number,
    array: Array<PersistedAttachment & { dataURL: string }>,
  ) => {
    if (!onOpenLightbox) return;
    const images = array.map((item) => ({ src: item.dataURL, name: item.name }));
    if (images.length === 0) return;
    onOpenLightbox({ images, index });
  };

  return (
    <div className={CONTAINER[variant]}>
      {imageAttachments.map((attachment, index, array) => (
        <button
          key={attachment.id}
          className="p-0 m-0 border-none bg-transparent"
          onClick={() => handleOpenLightbox(index, array)}
          title={t('attachments.openLarger')}
          type="button"
        >
          {/* The whole image at one height, its width following its shape (square
              until it loads): a square crop cut off part of what was sent. */}
          <img
            src={attachment.dataURL}
            alt={attachment.name || t('attachments.image')}
            width={144}
            height={144}
            loading="lazy"
            decoding="async"
            className="block h-28 w-auto max-w-56 sm:h-36 sm:max-w-72 object-contain attachment-thumb"
          />
        </button>
      ))}
      {audioAttachments.map((attachment) => (
        <div
          key={attachment.id}
          className="h-16 min-w-40 sm:min-w-48 max-w-72 px-3 py-2 attachment-chip flex items-center gap-2"
        >
          {attachment.dataURL ? (
            <audio controls preload="none" src={attachment.dataURL} className="h-10" />
          ) : (
            <span className="text-xs">{t('attachments.audioAttached')}</span>
          )}
          <div className="min-w-0">
            <div
              className="text-xs font-medium truncate"
              title={attachment.name || t('attachments.audio')}
            >
              {attachment.name || t('attachments.audio')}
            </div>
          </div>
        </div>
      ))}
      {pdfAttachments.map((attachment) => (
        <PdfChip
          key={attachment.id}
          name={attachment.name}
          detail={
            attachment.pageCount ? t('attachments.pages', { count: attachment.pageCount }) : 'PDF'
          }
        />
      ))}
    </div>
  );
}
