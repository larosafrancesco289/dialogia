import { useEffect, useCallback, useRef } from 'react';
import { lazyClient } from '@/lib/ui/lazy';
import { useChatStore } from '@/lib/store';

// Dynamically load settings drawer
const SettingsDrawer = lazyClient(() =>
  import('@/components/settings/SettingsDrawer').then((mod) => ({
    default: mod.SettingsDrawer,
  })),
);

/**
 * MobileSettingsSheet: opens the settings page on phones and keeps the tab
 * bar's state in step with it. The SettingsDrawer draws the page itself.
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

  // The drawer is already a full-screen page on phones, with its own header
  // and close button; wrapping it in a second sheet hid it behind that sheet.
  return <SettingsDrawer />;
}
