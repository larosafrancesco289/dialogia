'use client';

import { AnimatePresence } from 'framer-motion';
import { useChatStore } from '@/lib/store';
import { shallow } from 'zustand/shallow';
import { ChatPane } from '@/components/chat/ChatPane';
import { MobileBottomTabBar } from '@/components/mobile/MobileBottomTabBar';
import { MobileCollapsingHeader } from '@/components/mobile/MobileCollapsingHeader';
import { MobileChatsSheet } from '@/components/mobile/MobileChatsSheet';
import { MobileWarningBanner } from '@/components/mobile/MobileWarningBanner';
import { MobileFreeTierBanner } from '@/components/mobile/MobileFreeTierBanner';
import { lazyClient } from '@/lib/ui/lazy';
import styles from './MobileShell.module.css';

// Lazy load settings sheet (it's heavy)
const MobileSettingsSheet = lazyClient(() =>
  import(/* webpackPrefetch: true */ '@/components/mobile/MobileSettingsSheet').then((mod) => ({
    default: mod.MobileSettingsSheet,
  })),
);

const GlobalNotice = lazyClient(() =>
  import('@/components/GlobalNotice').then((mod) => ({ default: mod.GlobalNotice })),
);

/**
 * MobileShell - Root layout component for mobile devices.
 * Provides a native-feeling mobile experience with:
 * - Bottom tab bar navigation
 * - Collapsing header on scroll
 * - Full-screen sheets for chats
 * - Keyboard-aware layout
 */
export function MobileShell() {
  const { chatsSheetOpen, settingsSheetOpen, composerFocused } = useChatStore(
    (s) => ({
      chatsSheetOpen: s.ui.mobile.chatsSheetOpen,
      settingsSheetOpen: s.ui.mobile.settingsSheetOpen,
      composerFocused: s.ui.mobile.composerFocused,
    }),
    shallow,
  );

  return (
    <div className={styles.shell}>
      {/* Mobile Warning Banner */}
      <MobileWarningBanner />

      {/* Free Tier Access Code Banner */}
      <MobileFreeTierBanner />

      {/* Collapsing Header */}
      <MobileCollapsingHeader />

      {/* Main Content Area */}
      <main className={styles.main}>
        <ChatPane />
      </main>

      {/* Bottom Tab Bar - hide when composer is focused (keyboard open) */}
      {!composerFocused && <MobileBottomTabBar />}

      {/* Full-screen Sheets (portaled) */}
      <AnimatePresence>
        {chatsSheetOpen && <MobileChatsSheet />}
        {settingsSheetOpen && <MobileSettingsSheet />}
      </AnimatePresence>

      {/* Global Notice */}
      <GlobalNotice />
    </div>
  );
}
