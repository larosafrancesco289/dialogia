'use client';
import { createPortal } from 'react-dom';
import { useEffect, useRef } from 'react';

type Props = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      }
    };
    document.addEventListener('keydown', onKey);
    // Focus the cancel button first for safety
    cancelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] settings-overlay bg-black/40"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
        <div className="card p-4 w-full max-w-sm glass-panel">
          <div className="text-base font-medium mb-1">{title}</div>
          {description && <div className="text-sm text-muted-foreground mb-4">{description}</div>}
          <div className="flex items-center justify-end gap-2">
            <button ref={cancelRef} className="btn-outline btn-sm" onClick={onCancel}>
              {cancelLabel}
            </button>
            <button
              className="btn btn-sm bg-accent text-surface hover:bg-accent/90"
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
