import { useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { lazyClient } from '@/lib/ui/lazy';
import { useChatStore } from '@/lib/store';
import { springs } from '@/lib/mobile/springConfig';
import styles from './MobileSettingsSheet.module.css';
import { DialogPortal, DialogSurface } from '@/components/ui/Dialog';

// Dynamically load settings drawer
const SettingsDrawer = lazyClient(() =>
  import('@/components/settings/SettingsDrawer').then((mod) => ({
    default: mod.SettingsDrawer,
  })),
);

/**
 * MobileSettingsSheet - Full-screen settings overlay.
 *
 * Opens the SettingsDrawer in a mobile-friendly sheet format.
 * The SettingsDrawer handles its own content and state.
 */
export function MobileSettingsSheet() {
  const setUI = useChatStore((s) => s.setUI);
  const showSettings = useChatStore((s) => s.ui.showSettings);
  const hasInitialized = useRef(false);

  const close = useCallback(() => {
    setUI({ mobile: { settingsSheetOpen: false }, showSettings: false });
  }, [setUI]);

  // Sync showSettings state on mount
  useEffect(() => {
    setUI({ showSettings: true });
    // Mark as initialized after a brief delay to avoid race conditions
    const timer = setTimeout(() => {
      hasInitialized.current = true;
    }, 100);
    return () => {
      clearTimeout(timer);
      setUI({ showSettings: false });
    };
  }, [setUI]);

  // Watch for SettingsDrawer closing itself (via its own Close button)
  // Only react after initialization to avoid closing on mount
  useEffect(() => {
    if (hasInitialized.current && !showSettings) {
      setUI({ mobile: { settingsSheetOpen: false } });
    }
  }, [showSettings, setUI]);

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [close]);

  // Prevent body scroll when open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const content = (
    <>
      {/* Backdrop */}
      <motion.div
        className={styles.backdrop}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={close}
        aria-label="Close settings"
      />

      {/* Sheet */}
      <motion.div
        className={styles.sheet}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={springs.smooth}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.5 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 100 || info.velocity.y > 500) {
            close();
          }
        }}
      >
        {/* Handle */}
        <div className={styles.handleArea}>
          <div className={styles.handle} />
        </div>

        {/* Content - SettingsDrawer handles its own layout */}
        <div className={styles.content}>
          <SettingsDrawer />
        </div>
      </motion.div>
    </>
  );

  return (
    <DialogPortal>
      <DialogSurface className={styles.overlay} role="dialog" ariaLabel="Settings">
        {content}
      </DialogSurface>
    </DialogPortal>
  );
}
