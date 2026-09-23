import { useCallback, useEffect, useRef } from 'react';
import { motion, useTransform } from 'framer-motion';
import { useChatStore } from '@/lib/store';
import { shallow } from 'zustand/shallow';
import { ChatPane } from '@/components/chat/ChatPane';
import { MobileHeader } from '@/components/mobile/MobileHeader';
import { MobileDrawer } from '@/components/mobile/MobileDrawer';
import { ModuleSlot } from '@/components/ModuleSlot';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { selectCurrentChat } from '@/lib/store/selectors';
import { useMobileDrawer } from '@/components/mobile/useMobileDrawer';
import { useHaptics } from '@/lib/hooks/useHaptics';
import { useBackToClose } from '@/lib/hooks/useBackToClose';
import { lazyClient } from '@/lib/ui/lazy';
import styles from './MobileShell.module.css';

// The settings page is heavy and opened rarely; the same one as the desktop's.
const SettingsDrawer = lazyClient(() =>
  import(/* webpackPrefetch: true */ '@/components/settings/SettingsDrawer').then((mod) => ({
    default: mod.SettingsDrawer,
  })),
);

const GlobalNotice = lazyClient(() =>
  import('@/components/GlobalNotice').then((mod) => ({ default: mod.GlobalNotice })),
);
const SetupSheet = lazyClient(() =>
  import('@/components/SetupSheet').then((mod) => ({ default: mod.SetupSheet })),
);
const IntroTour = lazyClient(() =>
  import('@/components/intro/IntroTour').then((mod) => ({ default: mod.IntroTour })),
);

/**
 * MobileShell: the phone app. One page, the conversation, under a slim
 * header; the chat list is a drawer that pushes the page aside and follows
 * the finger, with Settings at its foot.
 */
export function MobileShell() {
  const {
    settingsOpen,
    setupOpen,
    introOpen,
    selectedChatId,
    rightPanelOpen,
    hasPanelContent,
    setUI,
    newChat,
  } = useChatStore(
    (s) => ({
      settingsOpen: s.ui.showSettings,
      setupOpen: s.ui.setupOpen === true,
      introOpen: s.ui.introSeen !== true,
      selectedChatId: s.selectedChatId,
      rightPanelOpen: s.ui.plan?.rightPanelOpen ?? false,
      hasPanelContent:
        !!selectCurrentChat(s)?.settings?.features.tutor?.learningPlan ||
        !!s.ui.plan?.sheetPlanOverride,
      setUI: s.setUI,
      newChat: s.newChat,
    }),
    shallow,
  );
  const { light } = useHaptics();
  const drawer = useMobileDrawer();
  const { open: drawerOpen, setOpen: setDrawerOpen } = drawer;
  const menuButtonRef = useRef<HTMLElement | null>(null);

  // The page moves with the drawer and dims under it. At rest it carries no
  // transform at all, so anything fixed inside it keeps the viewport as its
  // frame.
  const stageTransform = useTransform(drawer.offset, (v) =>
    v > 0 ? `translate3d(${v}px, 0, 0)` : 'none',
  );
  const scrimOpacity = useTransform(drawer.offset, [0, drawer.width], [0, 1]);
  const scrimVisibility = useTransform(drawer.offset, (v) => (v > 0 ? 'visible' : 'hidden'));

  const openDrawer = useCallback(() => {
    light();
    menuButtonRef.current = document.activeElement as HTMLElement | null;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.matches('input, textarea')) active.blur();
    setDrawerOpen(true);
  }, [light, setDrawerOpen]);

  const closeDrawer = useCallback(() => setDrawerOpen(false), [setDrawerOpen]);
  useBackToClose(drawerOpen, closeDrawer);

  const startNewChat = useCallback(async () => {
    light();
    await newChat();
  }, [light, newChat]);

  // Picking a chat, or starting one, puts the list away.
  const previousChatId = useRef(selectedChatId);
  useEffect(() => {
    if (selectedChatId !== previousChatId.current && drawerOpen) closeDrawer();
    previousChatId.current = selectedChatId;
  }, [selectedChatId, drawerOpen, closeDrawer]);

  // Escape closes the drawer and hands focus back to the button that opened it.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      // A sheet or dialog over the drawer takes this Escape, not the drawer.
      if (document.querySelector('[aria-modal="true"]')) return;
      closeDrawer();
      menuButtonRef.current?.focus?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen, closeDrawer]);

  // The desktop's side panel (the Learning Hub) is a tall sheet here. The
  // open flag persists for the desktop, where the panel sits beside the
  // chat; a phone opening on a sheet nobody asked for would be rude, so the
  // phone starts with it shut and opens it only when asked.
  useEffect(() => {
    if (useChatStore.getState().ui.plan?.rightPanelOpen) {
      setUI({ plan: { rightPanelOpen: false } });
    }
  }, [setUI]);
  const closePanel = useCallback(() => {
    setUI({ plan: { rightPanelOpen: false, sheetPlanOverride: null } });
  }, [setUI]);

  const openSettings = useCallback(() => {
    setUI({ mobile: { drawerOpen: false }, showSettings: true });
  }, [setUI]);

  return (
    <div className={styles.shell}>
      <motion.div
        className={styles.stage}
        style={{ transform: stageTransform }}
        // While the list is out, the page is only something to tap back to.
        {...(drawerOpen ? { inert: '' } : {})}
      >
        <MobileHeader drawerOpen={drawerOpen} onOpenDrawer={openDrawer} onNewChat={startNewChat} />

        <main className={styles.main}>
          <ChatPane />
        </main>
      </motion.div>

      <motion.div
        className={styles.scrim}
        style={{ opacity: scrimOpacity, visibility: scrimVisibility, x: drawer.offset }}
        onClick={closeDrawer}
        aria-hidden="true"
      />

      <MobileDrawer
        open={drawerOpen}
        width={drawer.width}
        offset={drawer.offset}
        onOpenSettings={openSettings}
        onClose={closeDrawer}
      />

      <BottomSheet
        open={rightPanelOpen && hasPanelContent}
        label="Learning Hub"
        onClose={closePanel}
        tall
      >
        <ModuleSlot slot="rightPanel" />
      </BottomSheet>

      {settingsOpen && <SettingsDrawer />}

      {/* The tour defers the setup sheet rather than stacking on it. */}
      {setupOpen && !introOpen && <SetupSheet />}
      {introOpen && <IntroTour />}

      <GlobalNotice />
    </div>
  );
}
