import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import styles from './MobileWarningBanner.module.css';

const STORAGE_KEY = 'dialogia-mobile-warning-dismissed';

/**
 * MobileWarningBanner - Displays a dismissible warning banner on mobile devices
 * informing users that mobile mode is not fully supported and may have bugs.
 * Uses the marginalia/editorial styling from the design system.
 */
export function MobileWarningBanner() {
  const [dismissed, setDismissed] = useState(true); // Start hidden to avoid flash

  useEffect(() => {
    // Check if user has previously dismissed the banner
    const wasDismissed = localStorage.getItem(STORAGE_KEY) === 'true';
    setDismissed(wasDismissed);
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(STORAGE_KEY, 'true');
  };

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          className={styles.banner}
          initial={{ opacity: 0, y: -20, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: -10, height: 0 }}
          transition={{
            duration: 0.35,
            ease: [0.2, 0.7, 0, 1], // --ease-emphasized
          }}
        >
          <div className={styles.content}>
            <div className={styles.iconWrapper}>
              <ExclamationTriangleIcon className={styles.icon} />
            </div>
            <div className={styles.text}>
              <span className={styles.title}>Mobile Preview</span>
              <span className={styles.message}>
                Mobile support is still in development. You may encounter bugs or incomplete
                features.
              </span>
            </div>
            <button
              type="button"
              className={styles.dismissButton}
              onClick={handleDismiss}
              aria-label="Dismiss mobile warning"
            >
              <XMarkIcon className={styles.dismissIcon} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
