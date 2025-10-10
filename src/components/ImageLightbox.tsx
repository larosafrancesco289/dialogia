'use client';
import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(images.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [images.length, onClose]);

  const download = () => {
    try {
      const a = document.createElement('a');
      a.href = current.src;
      const mime = current.src.slice(5, current.src.indexOf(';')) || 'image/png';
      const ext = mime.split('/')[1] || 'png';
      a.download = `${current.name || 'image'}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {}
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black/80 flex flex-col"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex items-center justify-between p-3 text-white">
        <div className="text-sm opacity-90">
          {index + 1} / {images.length} {current?.name ? `· ${current.name}` : ''}
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-outline btn-sm" onClick={download} title="Download">
            Download
          </button>
          <button className="btn btn-outline btn-sm" onClick={onClose} title="Close">
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
          className="btn btn-outline mr-3"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index <= 0}
          aria-label="Previous"
        >
          ‹
        </button>
        <img
          src={current?.src}
          alt={current?.name || 'image'}
          className="max-h-[85vh] max-w-[85vw] object-contain rounded border border-border bg-black"
        />
        <button
          className="btn btn-outline ml-3"
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
