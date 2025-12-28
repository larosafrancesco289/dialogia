'use client';
import type { ReactNode, RefObject } from 'react';
import { XCircleIcon } from '@heroicons/react/24/outline';
import { ThemeToggle } from '@/components/ThemeToggle';
import { IconButton } from '@/components/IconButton';

export function SettingsDrawerShell({
  closing,
  onClose,
  drawerRef,
  children,
}: {
  closing: boolean;
  onClose: () => void;
  drawerRef: RefObject<HTMLDivElement>;
  children: ReactNode;
}) {
  return (
    <>
      <div
        className={`fixed inset-0 bg-black/30 z-[70] settings-overlay${closing ? ' is-closing' : ''}`}
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={drawerRef}
        className={`fixed inset-y-0 right-0 w-full sm:w-[640px] glass-panel border-l border-border shadow-[var(--shadow-card)] z-[80] overflow-y-auto will-change-transform settings-drawer${closing ? ' is-closing' : ''}`}
        style={{ overscrollBehavior: 'contain' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        <div
          data-settings-header
          className="flex items-center gap-3 border-b border-border sticky top-0 glass z-10 px-4"
          style={{ height: 'var(--header-height)' }}
        >
          <h3 id="settings-title" className="font-semibold">
            Settings
          </h3>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <IconButton title="Close" onClick={onClose} className="w-11 h-11 sm:w-9 sm:h-9">
              <XCircleIcon className="h-6 w-6" />
            </IconButton>
          </div>
        </div>
        {children}
      </div>
    </>
  );
}
