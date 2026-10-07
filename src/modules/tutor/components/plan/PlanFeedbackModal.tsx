import { motionTransition } from '@/lib/ui/motion';
import { useState, useEffect, useRef } from 'react';
import { useBackToClose } from '@/lib/hooks/useBackToClose';
import { useModalFocus } from '@/lib/hooks/useModalFocus';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Markdown } from '@/components/Markdown';
import { ENTER_MODIFIER } from '@/components/message/MessageActions';
import { useT } from '@/modules/tutor/i18n';

export type PlanFeedbackContext =
  | { type: 'plan_proposal' }
  | { type: 'phase'; phaseName: string; phaseIndex: number }
  | { type: 'general' };

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
  const t = useT();
  const [feedback, setFeedback] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  useBackToClose(isOpen, onClose);
  useModalFocus(isOpen, surfaceRef, { initialFocus: textareaRef, onEscape: onClose });

  // Reset feedback when modal opens
  useEffect(() => {
    if (isOpen) setFeedback('');
  }, [isOpen]);

  // Closes on send: the note and the tutor's revised plan arrive in the chat.
  const handleSubmit = () => {
    if (!feedback.trim()) return;
    onSubmit(feedback.trim(), context);
    onClose();
  };

  const isPhaseContext = context.type === 'phase';
  const title = t('feedback.title');
  const subtitle = isPhaseContext ? t('feedback.about', { topic: context.phaseName }) : null;
  const placeholder = isPhaseContext
    ? t('feedback.placeholderTopic', { topic: context.phaseName })
    : t('feedback.placeholder');
  const canSubmit = feedback.trim().length > 0;

  // Portalled to the body: inside the side panel's stacking context the
  // scrim could not cover the top bar or the composer.
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={motionTransition.quick}
            className="scrim scrim--motion z-[100]"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={motionTransition.quick}
            className="dialog fixed left-1/2 top-1/2 z-[101] w-[90vw] max-w-lg -translate-x-1/2 -translate-y-1/2"
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-dialog-title"
            ref={surfaceRef}
            tabIndex={-1}
            onKeyDown={(e) => {
              // Portalled, but React bubbles its keys through the panel or card
              // that rendered it: its Escape must not reach them too.
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onClose();
                return;
              }
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canSubmit) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="feedback-dialog-title" className="dialog__title">
                  {title}
                </h3>
                {subtitle && (
                  <p className="dialog__lead">
                    <Markdown inline content={subtitle} />
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="icon-button -mr-1.5 -mt-1"
                aria-label={t('common.close')}
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <textarea
              ref={textareaRef}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder={placeholder}
              rows={6}
              className="textarea mt-4 text-sm leading-relaxed"
            />
            <p className="field__hint mt-2">{t('feedback.hint')}</p>

            <div className="dialog__actions">
              <span className="field__hint mr-auto hidden sm:inline">
                {t('feedback.shortcut', { key: ENTER_MODIFIER })}
              </span>
              <button onClick={onClose} className="btn-ghost btn-sm">
                {t('common.cancel')}
              </button>
              <button onClick={handleSubmit} disabled={!canSubmit} className="btn btn-sm">
                {t('feedback.send')}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
