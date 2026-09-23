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
};

export function ConfirmDialog({
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
              <button className="btn btn-sm" onClick={onConfirm}>
                {confirmLabel}
              </button>
            </div>
          </DialogSurface>
        </div>
      </DialogOverlay>
    </DialogPortal>
  );
}
