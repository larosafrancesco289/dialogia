import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import { findModelById, formatModelLabel } from '@/lib/models';
import { readNextOverrides } from '@/lib/ui/next';
import { isTutorRuntimeEnabled } from '@/lib/policy/runtime';
import { useTier } from '@/lib/auth/tierContext';
import { DEFAULT_FREE_TUTOR_MODEL_ID, FREE_MODEL_IDS } from '@/data/freeModels';

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
  const { isFreeTier, isStudyTier, tier } = useTier();

  const { chats, selectedChatId, renameChat, newChat, setUI, updateChatSettings, uiState, models } =
    useChatStore(
      (state) => ({
        chats: state.chats,
        selectedChatId: state.selectedChatId,
        renameChat: state.renameChat,
        newChat: state.newChat,
        setUI: state.setUI,
        updateChatSettings: state.updateChatSettings,
        uiState: state.ui,
        models: state.models,
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
  const nextOverrides = readNextOverrides(uiState);
  const nextTutorMode = !!nextOverrides.tutorMode;
  const tutorDefaultModelId = uiState.tutor.defaultModelId;
  const tutorActive = chat
    ? isTutorRuntimeEnabled(uiState, chat, tier)
    : isStudyTier || (experimentalTutor && (forceTutorMode || nextTutorMode));
  const rawTutorModelId =
    chat?.settings?.tutor_default_model || chat?.settings?.model || tutorDefaultModelId;
  const tutorModelId = useMemo(() => {
    if (isFreeTier && rawTutorModelId && !FREE_MODEL_IDS.includes(rawTutorModelId)) {
      return DEFAULT_FREE_TUTOR_MODEL_ID;
    }
    return rawTutorModelId;
  }, [isFreeTier, rawTutorModelId]);
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
    if (chat) {
      if (!chat.settings.tutor_mode) {
        setUI({ overrides: { tutorMode: true } });
        await newChat();
      } else {
        await updateChatSettings({ tutor_mode: false });
      }
    } else {
      setUI({ overrides: { tutorMode: !nextTutorMode } });
    }
  }, [forceTutorMode, chat, setUI, newChat, updateChatSettings, nextTutorMode]);

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
