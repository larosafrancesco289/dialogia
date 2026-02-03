'use client';

import { useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { useChatStore } from '@/lib/store';
import { shallow } from 'zustand/shallow';
import { useHaptics } from '@/lib/hooks/useHaptics';
import { springs } from '@/lib/mobile/springConfig';
import { ChatSidebar } from '@/components/sidebar/ChatSidebar';
import { XMarkIcon } from '@heroicons/react/24/outline';
import styles from './MobileChatsSheet.module.css';
import { DialogPortal, DialogSurface } from '@/components/ui/Dialog';

/**
 * MobileChatsSheet - Full-screen chat list overlay.
 *
 * Features:
 * - Wraps ChatSidebar
 * - Auto-closes when a chat is selected
 * - Spring-animated open/close
 * - Swipe down to dismiss
 */
export function MobileChatsSheet() {
  const { medium } = useHaptics();

  const { setUI, selectedChatId } = useChatStore(
    (s) => ({
      setUI: s.setUI,
      selectedChatId: s.selectedChatId,
    }),
    shallow,
  );

  const previousChatId = useRef(selectedChatId);

  const close = useCallback(() => {
    setUI({ mobile: { chatsSheetOpen: false } });
  }, [setUI]);

  // Close when chat selection changes
  useEffect(() => {
    if (selectedChatId !== previousChatId.current) {
      medium();
      close();
    }
    previousChatId.current = selectedChatId;
  }, [selectedChatId, medium, close]);

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
        aria-label="Close chats"
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
          // Close if dragged down far enough or with enough velocity
          if (info.offset.y > 100 || info.velocity.y > 500) {
            close();
          }
        }}
      >
        {/* Handle */}
        <div className={styles.handleArea}>
          <div className={styles.handle} />
        </div>

        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>Chats</h2>
          <button className={styles.closeButton} onClick={close} aria-label="Close">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Content - ChatSidebar */}
        <div className={styles.content}>
          <ChatSidebar collapsed={false} />
        </div>
      </motion.div>
    </>
  );

  return (
    <DialogPortal>
      <DialogSurface className={styles.overlay} role="dialog" ariaLabel="Chats">
        {content}
      </DialogSurface>
    </DialogPortal>
  );
}
