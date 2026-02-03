import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import { findModelById, formatModelLabel } from '@/lib/models';
import { useTier } from '@/lib/auth/tierContext';
import { useTierTutorModelId } from '@/lib/hooks/useTierModels';
import {
  selectIsTutorEnabled,
  selectMessagesForCurrentChat,
  selectNextOverrides,
} from '@/lib/store/selectors';

export type MobileHeaderState = {
  chatTitle: string;
  hasChat: boolean;
  tutorActive: boolean;
  tutorModelLabel: string;
  showTutorToggle: boolean;
  forceTutorMode: boolean;
  menuOpen: boolean;
  popoverPos: { left: number; top: number; width: number } | null;
  sheetRef: RefObject<HTMLDivElement>;
  anchorRef: RefObject<HTMLButtonElement>;
  onOpenSidebar: () => void;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onNewChat: () => void;
  onRenameChat: () => void;
  onOpenSettings: () => void;
  onToggleTutorMode: () => Promise<void>;
};

export function useMobileHeaderState(): MobileHeaderState {
  const { isStudyTier } = useTier();

  const {
    chats,
    selectedChatId,
    renameChat,
    newChat,
    setUI,
    updateChatSettings,
    clearChatMessages,
    uiState,
    models,
    messages,
    nextOverrides,
    tutorActive,
  } = useChatStore(
    (state) => ({
      chats: state.chats,
      selectedChatId: state.selectedChatId,
      renameChat: state.renameChat,
      newChat: state.newChat,
      setUI: state.setUI,
      updateChatSettings: state.updateChatSettings,
      clearChatMessages: state.clearChatMessages,
      uiState: state.ui,
      models: state.models,
      messages: selectMessagesForCurrentChat(state),
      nextOverrides: selectNextOverrides(state),
      tutorActive: selectIsTutorEnabled(state),
    }),
    shallow,
  );

  const chat = useMemo(
    () => (selectedChatId ? chats.find((c) => c.id === selectedChatId) : undefined),
    [chats, selectedChatId],
  );
  const chatTitle = chat?.title || 'Untitled chat';
  const hasChat = !!chat;

  const experimentalTutor = !!uiState.flags.experimentalTutor;
  const forceTutorMode = !!uiState.tutor.forceMode;
  const nextTutorMode = !!nextOverrides.tutorMode;
  const tutorDefaultModelId = uiState.tutor.defaultModelId;
  const rawTutorModelId =
    chat?.settings?.features.tutor.defaultModelId || chat?.settings?.modelId || tutorDefaultModelId;
  const tutorModelId = useTierTutorModelId(rawTutorModelId);
  const tutorModelMeta = useMemo(() => findModelById(models, tutorModelId), [models, tutorModelId]);
  const tutorModelLabel = useMemo(
    () =>
      tutorModelId ? formatModelLabel({ model: tutorModelMeta, fallbackId: tutorModelId }) : '',
    [tutorModelMeta, tutorModelId],
  );

  const [menuOpen, setMenuOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const ignoreAnchorClickRef = useRef(false);
  const ignoreAnchorResetRef = useRef<number | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ left: number; top: number; width: number } | null>(
    null,
  );

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (sheetRef.current && sheetRef.current.contains(target)) return;
      if (anchorRef.current && anchorRef.current.contains(target)) return;
      setMenuOpen(false);
      ignoreAnchorClickRef.current = true;
      if (ignoreAnchorResetRef.current !== null) {
        window.clearTimeout(ignoreAnchorResetRef.current);
      }
      ignoreAnchorResetRef.current = window.setTimeout(() => {
        ignoreAnchorClickRef.current = false;
        ignoreAnchorResetRef.current = null;
      }, 0);
    };
    const update = () => {
      if (!anchorRef.current) return;
      const rect = anchorRef.current.getBoundingClientRect();
      const margin = 12;
      const width = Math.min(280, window.innerWidth - margin * 2);
      const left = Math.min(Math.max(rect.left, margin), window.innerWidth - width - margin);
      const top = rect.bottom + 20;
      setPopoverPos({ left, top, width });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      if (ignoreAnchorResetRef.current !== null) {
        window.clearTimeout(ignoreAnchorResetRef.current);
        ignoreAnchorResetRef.current = null;
      }
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [menuOpen]);

  const onRenameChat = useCallback(() => {
    if (!chat) return;
    const next = window.prompt('Rename chat', chat.title || 'Untitled chat');
    const trimmed = (next || '').trim();
    if (!trimmed || trimmed === chat.title) return;
    renameChat(chat.id, trimmed).catch(() => void 0);
  }, [chat, renameChat]);

  const onOpenSidebar = useCallback(() => {
    setUI({ sidebarCollapsed: false });
  }, [setUI]);

  const onToggleMenu = useCallback(() => {
    if (ignoreAnchorClickRef.current) {
      ignoreAnchorClickRef.current = false;
      return;
    }
    setMenuOpen((value) => !value);
  }, []);

  const onCloseMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);

  const onNewChat = useCallback(() => {
    void newChat();
  }, [newChat]);

  const onOpenSettings = useCallback(() => {
    setUI({ showSettings: true });
    import('@/components/settings/SettingsDrawer').catch(() => undefined);
  }, [setUI]);

  const onToggleTutorMode = useCallback(async () => {
    if (forceTutorMode) return;

    if (!chat) {
      // No chat exists: toggle the override flag for the next chat
      setUI({ overrides: { tutorMode: !nextTutorMode } });
      return;
    }

    const isTutorChat = chat.settings.features.tutor.enabled;
    const hasUserMessages = messages && messages.some((m) => m.role === 'user');

    if (isTutorChat) {
      if (hasUserMessages) {
        // In tutor chat with user messages: start a new non-tutor chat
        setUI({ overrides: { tutorMode: false } });
        await newChat();
      } else {
        // In tutor chat with only welcome message: disable tutor and clear the welcome message
        clearChatMessages();
        await updateChatSettings({ features: { tutor: { enabled: false } } });
      }
    } else if (hasUserMessages) {
      // In non-tutor chat with messages: ask for confirmation before starting new tutor chat
      const confirmed = window.confirm(
        'Starting a learning session will create a new chat. Continue?',
      );
      if (confirmed) {
        setUI({ overrides: { tutorMode: true } });
        await newChat();
      }
    } else {
      // In empty non-tutor chat: enable tutor in current chat (will trigger welcome message)
      await updateChatSettings({ features: { tutor: { enabled: true } } });
    }
  }, [
    forceTutorMode,
    chat,
    clearChatMessages,
    messages,
    setUI,
    newChat,
    updateChatSettings,
    nextTutorMode,
  ]);

  return {
    chatTitle,
    hasChat,
    tutorActive,
    tutorModelLabel,
    showTutorToggle: experimentalTutor && !isStudyTier,
    forceTutorMode,
    menuOpen,
    popoverPos,
    sheetRef,
    anchorRef,
    onOpenSidebar,
    onToggleMenu,
    onCloseMenu,
    onNewChat,
    onRenameChat,
    onOpenSettings,
    onToggleTutorMode,
  };
}
