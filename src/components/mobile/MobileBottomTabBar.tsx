import { useCallback } from 'react';
import { motion } from 'framer-motion';
import { useChatStore } from '@/lib/store';
import { shallow } from 'zustand/shallow';
import { useHaptics } from '@/lib/hooks/useHaptics';
import { springs } from '@/lib/mobile/springConfig';
import type { MobileTab } from '@/lib/store/types';
import { ChatBubbleLeftRightIcon, PlusIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
import {
  ChatBubbleLeftRightIcon as ChatBubbleLeftRightIconSolid,
  Cog6ToothIcon as Cog6ToothIconSolid,
} from '@heroicons/react/24/solid';
import styles from './MobileBottomTabBar.module.css';

/**
 * MobileBottomTabBar - Native-feeling bottom navigation with 3 tabs.
 *
 * - Chats: Opens full-screen chat list sheet
 * - New (center): Creates new chat with accent styling
 * - Settings: Opens full-screen settings sheet
 *
 * Features spring animations and haptic feedback.
 */
export function MobileBottomTabBar() {
  const { light, medium } = useHaptics();

  const { activeTab, setUI, newChat } = useChatStore(
    (s) => ({
      activeTab: s.ui.mobile.activeTab,
      setUI: s.setUI,
      newChat: s.newChat,
    }),
    shallow,
  );

  const handleTabPress = useCallback(
    async (tab: MobileTab) => {
      light();

      if (tab === 'chats') {
        setUI({ mobile: { chatsSheetOpen: true, activeTab: 'chats' } });
      } else if (tab === 'new') {
        medium();
        await newChat();
        setUI({ mobile: { activeTab: 'new' } });
      } else if (tab === 'settings') {
        setUI({ mobile: { settingsSheetOpen: true, activeTab: 'settings' } });
      }
    },
    [light, medium, setUI, newChat],
  );

  return (
    <nav className={styles.tabBar} role="navigation" aria-label="Main navigation">
      {/* Chats Tab */}
      <button
        className={`${styles.tab} ${activeTab === 'chats' ? styles.active : ''}`}
        onClick={() => handleTabPress('chats')}
        aria-label="Open chats"
        aria-current={activeTab === 'chats' ? 'page' : undefined}
      >
        <motion.div
          className={styles.tabIcon}
          whileTap={{ scale: 0.9 }}
          transition={springs.snappy}
        >
          {activeTab === 'chats' ? (
            <ChatBubbleLeftRightIconSolid className="h-6 w-6" />
          ) : (
            <ChatBubbleLeftRightIcon className="h-6 w-6" />
          )}
        </motion.div>
        <span className={styles.tabLabel}>Chats</span>
      </button>

      {/* New Chat Tab (Center, Primary) */}
      <button
        className={`${styles.tab} ${styles.primary}`}
        onClick={() => handleTabPress('new')}
        aria-label="Start new chat"
      >
        <motion.div
          className={styles.primaryButton}
          whileTap={{ scale: 0.92 }}
          whileHover={{ scale: 1.02 }}
          transition={springs.bouncy}
        >
          <PlusIcon className="h-7 w-7" strokeWidth={2.5} />
        </motion.div>
      </button>

      {/* Settings Tab */}
      <button
        className={`${styles.tab} ${activeTab === 'settings' ? styles.active : ''}`}
        onClick={() => handleTabPress('settings')}
        aria-label="Open settings"
        aria-current={activeTab === 'settings' ? 'page' : undefined}
      >
        <motion.div
          className={styles.tabIcon}
          whileTap={{ scale: 0.9 }}
          transition={springs.snappy}
        >
          {activeTab === 'settings' ? (
            <Cog6ToothIconSolid className="h-6 w-6" />
          ) : (
            <Cog6ToothIcon className="h-6 w-6" />
          )}
        </motion.div>
        <span className={styles.tabLabel}>Settings</span>
      </button>
    </nav>
  );
}
