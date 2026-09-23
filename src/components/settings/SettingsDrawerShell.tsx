import type { ReactNode, RefObject } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeftIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { IconButton } from '@/components/ui/IconButton';
import { SettingsSearch } from '@/components/settings/SettingsSearch';
import { springs, variants } from '@/lib/mobile/springConfig';
import { DialogOverlay, DialogPortal } from '@/components/ui/Dialog';

type SettingsDrawerShellProps = {
  closing: boolean;
  onClose: () => void;
  drawerRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  /** The page's own title, when it is a page inside Settings (phones). */
  title?: string;
  /** Back to the list of Settings pages (phones). */
  onBack?: () => void;
};

export function SettingsDrawerShell({
  closing,
  onClose,
  drawerRef,
  children,
  searchQuery = '',
  onSearchChange,
  title = 'Settings',
  onBack,
}: SettingsDrawerShellProps) {
  return (
    <AnimatePresence>
      {!closing && (
        <DialogPortal>
          <>
            {/* Backdrop */}
            <DialogOverlay
              as={motion.div}
              className="scrim z-[70]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClose={onClose}
            />

            {/* Drawer */}
            <motion.div
              ref={(el) => {
                if (drawerRef && 'current' in drawerRef) {
                  (drawerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
                }
              }}
              className="settings-panel fixed inset-y-0 right-0 w-full sm:w-[720px] z-[80] overflow-y-auto will-change-transform"
              style={{ overscrollBehavior: 'contain' }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="settings-title"
              tabIndex={-1}
              initial="initial"
              animate="animate"
              exit="exit"
              variants={variants.slideFromRight}
              transition={springs.smooth}
              onKeyDown={(e) => {
                // A field that used Escape (clearing a search, closing its
                // list) marks it handled; only a free Escape closes Settings.
                if (e.key === 'Escape' && !e.defaultPrevented) onClose();
              }}
            >
              {/* Minimal Header */}
              <header data-settings-header className="settings-panel__header">
                {onBack && (
                  <button
                    type="button"
                    className="settings-panel__back"
                    onClick={onBack}
                    aria-label="Back to Settings"
                  >
                    <ChevronLeftIcon className="h-5 w-5" aria-hidden="true" />
                  </button>
                )}
                <h2 id="settings-title" className="settings-panel__title">
                  {title}
                </h2>

                {onSearchChange && (
                  <SettingsSearch
                    value={searchQuery}
                    onChange={onSearchChange}
                    placeholder="Search settings…"
                  />
                )}

                <div className="ml-auto">
                  <IconButton title="Close settings" onClick={onClose}>
                    <XMarkIcon className="h-5 w-5" />
                  </IconButton>
                </div>
              </header>

              {children}
            </motion.div>
          </>
        </DialogPortal>
      )}
    </AnimatePresence>
  );
}
