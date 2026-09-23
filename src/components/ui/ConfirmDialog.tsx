import { useEffect, useRef } from 'react';
import { DialogOverlay, DialogPortal, DialogSurface } from '@/components/ui/Dialog';

type Props = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  /** A destructive confirmation reads in crimson, not gold. */
  tone?: 'default' | 'danger';
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  tone = 'danger',
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Enter is left to the focused button, so it answers what is focused:
  // Cancel, where focus starts, until the reader moves to the other one.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <DialogPortal>
      <DialogOverlay className="scrim z-[90]" onClose={onCancel}>
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
          <DialogSurface className="dialog max-w-sm" ariaLabel={title}>
            <h2 className="dialog__title">{title}</h2>
            {description && <p className="dialog__lead">{description}</p>}
            <div className="dialog__actions">
              <button ref={cancelRef} className="btn-outline btn-sm" onClick={onCancel}>
                {cancelLabel}
              </button>
              <button
                className={`btn btn-sm${tone === 'danger' ? ' btn-danger' : ''}`}
                onClick={onConfirm}
              >
                {confirmLabel}
              </button>
            </div>
          </DialogSurface>
        </div>
      </DialogOverlay>
    </DialogPortal>
  );
}
