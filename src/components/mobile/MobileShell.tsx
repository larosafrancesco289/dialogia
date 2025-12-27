'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useChatStore } from '@/lib/store';
import { shallow } from 'zustand/shallow';
import { ChatPane } from '@/components/ChatPane';
import { MobileBottomTabBar } from '@/components/mobile/MobileBottomTabBar';
import { MobileCollapsingHeader } from '@/components/mobile/MobileCollapsingHeader';
import { MobileChatsSheet } from '@/components/mobile/MobileChatsSheet';
import { initializeTheme } from '@/components/ThemeToggle';
import dynamic from 'next/dynamic';
import styles from './MobileShell.module.css';

// Lazy load settings sheet (it's heavy)
const MobileSettingsSheet = dynamic(
  () =>
    import(/* webpackPrefetch: true */ '@/components/mobile/MobileSettingsSheet').then(
      (mod) => mod.MobileSettingsSheet,
    ),
  { ssr: false },
);

const GlobalNotice = dynamic(
  () => import('@/components/GlobalNotice').then((mod) => ({ default: mod.GlobalNotice })),
  { ssr: false },
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
  const [mounted, setMounted] = useState(false);

  const { chatsSheetOpen, settingsSheetOpen, composerFocused, initialize } = useChatStore(
    (s) => ({
      chatsSheetOpen: s.ui.mobile.chatsSheetOpen,
      settingsSheetOpen: s.ui.mobile.settingsSheetOpen,
      composerFocused: s.ui.mobile.composerFocused,
      initialize: s.initializeApp,
    }),
    shallow,
  );

  useEffect(() => {
    setMounted(true);
    initialize();
    initializeTheme();
  }, [initialize]);

  return (
    <div className={styles.shell}>
      {/* Collapsing Header */}
      <MobileCollapsingHeader />

      {/* Main Content Area */}
      <main className={styles.main}>
        <ChatPane />
      </main>

      {/* Bottom Tab Bar - hide when composer is focused (keyboard open) */}
      {!composerFocused && <MobileBottomTabBar />}

      {/* Full-screen Sheets (portaled) */}
      {mounted && (
        <AnimatePresence>
          {chatsSheetOpen && <MobileChatsSheet />}
          {settingsSheetOpen && <MobileSettingsSheet />}
        </AnimatePresence>
      )}

      {/* Global Notice */}
      <GlobalNotice />
    </div>
  );
}
