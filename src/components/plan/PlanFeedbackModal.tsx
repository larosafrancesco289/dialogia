'use client';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline';

export type PlanFeedbackContext =
  | { type: 'plan_proposal' }
  | { type: 'phase'; phaseName: string; phaseIndex: number };

export function PlanFeedbackModal({
  isOpen,
  context,
  onSubmit,
  onClose,
}: {
  isOpen: boolean;
  context: PlanFeedbackContext;
  onSubmit: (feedback: string, context: PlanFeedbackContext) => void;
  onClose: () => void;
}) {
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset feedback when modal opens
  useEffect(() => {
    if (isOpen) {
      setFeedback('');
      setIsSubmitting(false);
      // Focus textarea after animation
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!feedback.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit(feedback.trim(), context);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Keyboard handling
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
      // Cmd/Ctrl + Enter to submit
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && feedback.trim() && !isSubmitting) {
        e.preventDefault();
        handleSubmit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, feedback, isSubmitting, onClose]);

  const isPhaseContext = context.type === 'phase';
  const title = 'Share feedback with your tutor';
  const subtitle = isPhaseContext
    ? `About ${context.phaseName}...`
    : 'Suggest changes to your learning plan';
  const placeholder = isPhaseContext
    ? `What would you like to change about ${context.phaseName}?\n\nExamples:\n• "Can we go deeper on X before moving on?"\n• "I'd like to reorder these topics"\n• "This feels too advanced, can we add prerequisites?"`
    : `What would you like to adjust?\n\nExamples:\n• "Could we add more practice for the fundamentals?"\n• "I already know X, can we skip or accelerate it?"\n• "Can we reorganize to focus more on Y?"`;
  const canSubmit = feedback.trim().length > 0 && !isSubmitting;

  return (
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
            onClick={onClose}
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            className="fixed left-1/2 top-1/2 z-[101] w-[90vw] max-w-lg -translate-x-1/2 -translate-y-1/2"
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-dialog-title"
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
                className="flex items-start justify-between px-5 py-4"
                style={{
                  borderBottom: '1px solid var(--rule-light)',
                  background: 'var(--marginalia-bg)',
                }}
              >
                <div className="flex flex-col gap-1">
                  <h3
                    id="feedback-dialog-title"
                    className="text-base font-semibold"
                    style={{
                      fontFamily: 'var(--font-serif-assistant)',
                      color: 'var(--color-fg)',
                    }}
                  >
                    {title}
                  </h3>
                  <span className="text-xs text-muted-foreground">{subtitle}</span>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/5 -mr-1.5 -mt-1"
                  aria-label="Close"
                >
                  <XMarkIcon className="h-5 w-5 text-muted-foreground" />
                </button>
              </div>

              {/* Content */}
              <div className="px-5 py-4 space-y-4">
                <textarea
                  ref={textareaRef}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder={placeholder}
                  rows={6}
                  className="w-full resize-none text-sm leading-relaxed focus:outline-none"
                  style={{
                    background: 'var(--surface-input)',
                    border: '1px solid var(--rule-light)',
                    borderRadius: 'var(--radius-editorial)',
                    padding: '0.75rem 1rem',
                    color: 'var(--color-fg)',
                  }}
                  disabled={isSubmitting}
                />

                <div
                  className="p-3 text-xs"
                  style={{
                    background: 'var(--marginalia-bg)',
                    borderRadius: 'var(--radius-editorial)',
                    borderLeft: '2px solid var(--color-accent)',
                    color: 'var(--color-fg-muted)',
                  }}
                >
                  Your feedback will appear in the chat. The tutor will review your suggestions and
                  propose an updated plan.
                </div>
              </div>

              {/* Footer */}
              <div
                className="flex items-center justify-between px-5 py-4"
                style={{ borderTop: '1px solid var(--rule-light)' }}
              >
                <span className="text-[10px] text-muted-foreground hidden sm:inline">
                  <kbd
                    className="px-1.5 py-0.5 rounded"
                    style={{
                      background: 'var(--marginalia-bg)',
                      border: '1px solid var(--rule-light)',
                    }}
                  >
                    ⌘
                  </kbd>{' '}
                  +{' '}
                  <kbd
                    className="px-1.5 py-0.5 rounded"
                    style={{
                      background: 'var(--marginalia-bg)',
                      border: '1px solid var(--rule-light)',
                    }}
                  >
                    Enter
                  </kbd>{' '}
                  to send
                </span>
                <div className="flex gap-3 ml-auto">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium transition-colors"
                    style={{
                      color: 'var(--color-fg-muted)',
                      background: 'transparent',
                      border: '1px solid var(--rule-light)',
                      borderRadius: 'var(--radius-editorial)',
                    }}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all active:scale-[0.98]"
                    style={{
                      color: canSubmit ? '#0b0b0b' : 'var(--color-fg-muted)',
                      background: canSubmit ? 'var(--color-accent)' : 'var(--marginalia-bg)',
                      border: 'none',
                      borderRadius: 'var(--radius-editorial)',
                      boxShadow: canSubmit
                        ? '0 1px 0 rgba(255, 255, 255, 0.3) inset, var(--shadow-1)'
                        : 'none',
                      opacity: canSubmit ? 1 : 0.6,
                      cursor: canSubmit ? 'pointer' : 'not-allowed',
                    }}
                  >
                    <PaperAirplaneIcon className="h-4 w-4" />
                    {isSubmitting ? 'Sending...' : 'Send to tutor'}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
