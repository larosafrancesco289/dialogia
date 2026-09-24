import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { logger } from '@/lib/logger';
import { useModalFocus } from '@/lib/hooks/useModalFocus';

type Img = { src: string; name?: string };

export function ImageLightbox({
  images,
  initialIndex = 0,
  onClose,
}: {
  images: Img[];
  initialIndex?: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(
    Math.min(Math.max(0, initialIndex), Math.max(0, images.length - 1)),
  );
  const current = images[index];
  const rootRef = useRef<HTMLDivElement>(null);
  useModalFocus(true, rootRef, { onEscape: onClose });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(images.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [images.length]);

  const download = () => {
    if (!current) return;
    try {
      const a = document.createElement('a');
      a.href = current.src;
      const mime = current.src.slice(5, current.src.indexOf(';')) || 'image/png';
      const ext = mime.split('/')[1] || 'png';
      a.download = `${current.name || 'image'}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      logger.error('Failed to download image', error);
    }
  };

  if (!current) return null;

  return createPortal(
    <div
      ref={rootRef}
      className="lightbox fixed inset-0 z-[100] flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      tabIndex={-1}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="lightbox__bar flex items-center justify-between p-3">
        <div className="text-sm opacity-90">
          {index + 1} / {images.length} {current?.name ? `· ${current.name}` : ''}
        </div>
        <div className="flex items-center gap-2">
          <button className="lightbox__btn" onClick={download} title="Download">
            Download
          </button>
          <button className="lightbox__btn" onClick={onClose} title="Close">
            Close
          </button>
        </div>
      </div>
      <div
        className="flex-1 flex items-center justify-center p-4"
        onClick={(e) => {
          // Allow clicking on the empty space around the image to close
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <button
          className="lightbox__btn lightbox__nav mr-3"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index <= 0}
          aria-label="Previous"
        >
          ‹
        </button>
        <div className="relative h-[85vh] w-[85vw]">
          <img
            src={current.src}
            alt={current.name || 'image'}
            className="absolute inset-0 h-full w-full object-contain"
          />
        </div>
        <button
          className="lightbox__btn lightbox__nav ml-3"
          onClick={() => setIndex((i) => Math.min(images.length - 1, i + 1))}
          disabled={index >= images.length - 1}
          aria-label="Next"
        >
          ›
        </button>
      </div>
    </div>,
    document.body,
  );
}
