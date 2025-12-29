'use client';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import { springs } from '@/lib/mobile/springConfig';

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export type AutoSaveToastProps = {
  status: AutoSaveStatus;
  message?: string;
  autoDismissDelay?: number;
};

export function AutoSaveToast({ status, message, autoDismissDelay = 2000 }: AutoSaveToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (status === 'saving' || status === 'saved' || status === 'error') {
      setVisible(true);
    }

    if (status === 'saved') {
      const timer = setTimeout(() => {
        setVisible(false);
      }, autoDismissDelay);
      return () => clearTimeout(timer);
    }

    if (status === 'idle') {
      setVisible(false);
    }
  }, [status, autoDismissDelay]);

  const getContent = () => {
    switch (status) {
      case 'saving':
        return (
          <>
            <span className="auto-save-toast-spinner" />
            <span>{message || 'Saving...'}</span>
          </>
        );
      case 'saved':
        return (
          <>
            <CheckIcon className="h-4 w-4" />
            <span>{message || 'Saved'}</span>
          </>
        );
      case 'error':
        return (
          <>
            <ExclamationCircleIcon className="h-4 w-4" />
            <span>{message || 'Save failed'}</span>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className={`auto-save-toast auto-save-toast--${status}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={springs.gentle}
        >
          {getContent()}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
