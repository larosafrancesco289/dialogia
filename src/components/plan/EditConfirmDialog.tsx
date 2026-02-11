'use client';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

export type EditConfirmAction =
  | { type: 'confidence_adjust'; nodeId: string; nodeName: string; from: number; to: number }
  | { type: 'misconception_resolve'; nodeId: string; nodeName: string; misconceptionDesc: string }
  | { type: 'mark_known'; nodeId: string; nodeName: string }
  | { type: 'flag_review'; nodeId: string; nodeName: string }
  | { type: 'set_confidence_floor'; nodeId: string; nodeName: string; floor: number }
  | { type: 'topic_reorder'; nodeId: string; nodeName: string; newPosition: number }
  | {
      type: 'prerequisites_change';
      nodeId: string;
      nodeName: string;
      added: string[];
      removed: string[];
    }
  | { type: 'topic_remove'; nodeId: string; nodeName: string }
  | { type: 'suggest_change'; suggestion: string };

export function EditConfirmDialog({
  isOpen,
  action,
  onConfirm,
  onCancel,
}: {
  isOpen: boolean;
  action: EditConfirmAction | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onCancel]);

  const getDialogContent = () => {
    if (!action) return { title: '', changes: [], warning: false };

    switch (action.type) {
      case 'confidence_adjust':
        return {
          title: 'Adjust Your Confidence',
          changes: [
            `Topic: ${action.nodeName}`,
            `Confidence: ${Math.round(action.from * 100)}% → ${Math.round(action.to * 100)}%`,
          ],
          warning: false,
        };
      case 'misconception_resolve':
        return {
          title: 'Resolve Misconception',
          changes: [
            `Topic: ${action.nodeName}`,
            `Marking as resolved: "${action.misconceptionDesc}"`,
          ],
          warning: false,
        };
      case 'mark_known':
        return {
          title: 'Mark Topic as Known',
          changes: [
            `Topic: ${action.nodeName}`,
            'Status will be set to completed',
            'Confidence floor set to 70%',
          ],
          warning: false,
        };
      case 'flag_review':
        return {
          title: 'Flag for Review',
          changes: [
            `Topic: ${action.nodeName}`,
            'This topic will be flagged for additional practice',
          ],
          warning: false,
        };
      case 'set_confidence_floor':
        return {
          title: 'Set Confidence Floor',
          changes: [
            `Topic: ${action.nodeName}`,
            `Minimum confidence: ${Math.round(action.floor * 100)}%`,
          ],
          warning: false,
        };
      case 'topic_reorder':
        return {
          title: 'Reorder Topic',
          changes: [`Moving: ${action.nodeName}`, `To position: ${action.newPosition + 1}`],
          warning: true,
        };
      case 'prerequisites_change':
        return {
          title: 'Change Prerequisites',
          changes: [
            `Topic: ${action.nodeName}`,
            ...(action.added.length > 0 ? [`Adding: ${action.added.join(', ')}`] : []),
            ...(action.removed.length > 0 ? [`Removing: ${action.removed.join(', ')}`] : []),
          ],
          warning: true,
        };
      case 'topic_remove':
        return {
          title: 'Remove Topic',
          changes: [`Topic: ${action.nodeName}`, 'This topic will be removed from your plan'],
          warning: true,
        };
      case 'suggest_change':
        return {
          title: 'Suggest Change to Tutor',
          changes: [
            `Your suggestion: "${action.suggestion.slice(0, 100)}${action.suggestion.length > 100 ? '...' : ''}"`,
          ],
          warning: false,
        };
      default:
        return { title: 'Confirm Change', changes: [], warning: false };
    }
  };

  const { title, changes, warning } = getDialogContent();

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[100]"
            style={{ background: 'rgba(0, 0, 0, 0.4)' }}
            onClick={onCancel}
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            className="fixed left-1/2 top-1/2 z-[101] w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
          >
            <div
              className="overflow-hidden"
              style={{
                background: 'var(--surface-paper)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-3)',
                border: '1px solid var(--rule-light)',
              }}
            >
              {/* Header */}
              <div
                className="flex items-center justify-between px-5 py-4"
                style={{
                  borderBottom: '1px solid var(--rule-light)',
                  background: warning
                    ? 'color-mix(in oklab, var(--color-danger) 8%, var(--surface-paper))'
                    : 'var(--marginalia-bg)',
                }}
              >
                <div className="flex items-center gap-3">
                  {warning && (
                    <ExclamationTriangleIcon
                      className="h-5 w-5"
                      style={{ color: 'var(--color-danger)' }}
                    />
                  )}
                  <h3
                    id="confirm-dialog-title"
                    className="text-base font-semibold"
                    style={{
                      fontFamily: 'var(--font-serif-assistant)',
                      color: 'var(--color-fg)',
                    }}
                  >
                    {title}
                  </h3>
                </div>
                <button
                  onClick={onCancel}
                  className="p-1.5 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                  aria-label="Close"
                >
                  <XMarkIcon className="h-5 w-5 text-muted-foreground" />
                </button>
              </div>

              {/* Content */}
              <div className="px-5 py-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  You&apos;re making the following changes:
                </p>
                <ul className="space-y-1.5">
                  {changes.map((change, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm"
                      style={{ color: 'var(--color-fg)' }}
                    >
                      <span
                        className="mt-2 h-1 w-1 shrink-0 rounded-full"
                        style={{ background: 'var(--color-accent)' }}
                      />
                      {change}
                    </li>
                  ))}
                </ul>

                <div
                  className="mt-4 p-3 text-xs"
                  style={{
                    background: 'var(--marginalia-bg)',
                    borderRadius: 'var(--radius-editorial)',
                    borderLeft: '2px solid var(--color-accent)',
                    color: 'var(--color-fg-muted)',
                  }}
                >
                  The tutor will be notified of this adjustment and may respond accordingly.
                </div>
              </div>

              {/* Footer */}
              <div
                className="flex justify-end gap-3 px-5 py-4"
                style={{ borderTop: '1px solid var(--rule-light)' }}
              >
                <button
                  onClick={onCancel}
                  className="px-4 py-2 text-sm font-medium transition-colors"
                  style={{
                    color: 'var(--color-fg-muted)',
                    background: 'transparent',
                    border: '1px solid var(--rule-light)',
                    borderRadius: 'var(--radius-editorial)',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={onConfirm}
                  className="px-4 py-2 text-sm font-medium transition-all active:scale-[0.98]"
                  style={{
                    color: warning ? '#fff' : '#0b0b0b',
                    background: warning ? 'var(--color-danger)' : 'var(--color-accent)',
                    border: 'none',
                    borderRadius: 'var(--radius-editorial)',
                    boxShadow: '0 1px 0 rgba(255, 255, 255, 0.3) inset, var(--shadow-1)',
                  }}
                >
                  Confirm
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
