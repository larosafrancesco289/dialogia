import type { ReactNode, RefObject } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon } from '@heroicons/react/24/outline';
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
};

export function SettingsDrawerShell({
  closing,
  onClose,
  drawerRef,
  children,
  searchQuery = '',
  onSearchChange,
}: SettingsDrawerShellProps) {
  return (
    <AnimatePresence>
      {!closing && (
        <DialogPortal>
          <>
            {/* Backdrop */}
            <DialogOverlay
              as={motion.div}
              className="fixed inset-0 bg-black/30 z-[70]"
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
              className="fixed inset-y-0 right-0 w-full sm:w-[720px] bg-surface border-l border-border shadow-[var(--shadow-card)] z-[80] overflow-y-auto will-change-transform"
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
                if (e.key === 'Escape') onClose();
              }}
            >
              {/* Minimal Header */}
              <header
                data-settings-header
                className="flex items-center gap-3 border-b border-border sticky top-0 bg-surface z-10 px-4"
                style={{ height: 'var(--header-height)' }}
              >
                <h2 id="settings-title" className="text-lg font-semibold shrink-0">
                  Settings
                </h2>

                {onSearchChange && (
                  <SettingsSearch
                    value={searchQuery}
                    onChange={onSearchChange}
                    placeholder="Search settings..."
                  />
                )}

                <div className="ml-auto">
                  <IconButton title="Close settings" onClick={onClose} className="w-9 h-9">
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
