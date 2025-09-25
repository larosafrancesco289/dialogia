'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useChatStore } from '@/lib/store';
import { shallow } from 'zustand/shallow';
import {
  Bars3Icon,
  EllipsisVerticalIcon,
  PlusIcon,
  PencilSquareIcon,
  Squares2X2Icon,
  Cog6ToothIcon,
  XMarkIcon,
  AcademicCapIcon,
} from '@heroicons/react/24/outline';
import ModelPicker from '@/components/ModelPicker';
import ThemeToggle from '@/components/ThemeToggle';
import { findModelById, formatModelLabel } from '@/lib/models';

export default function MobileHeader() {
  const { chats, selectedChatId, renameChat, newChat, setUI, openCompare, updateChatSettings } =
    useChatStore(
      (state) => ({
        chats: state.chats,
        selectedChatId: state.selectedChatId,
        renameChat: state.renameChat,
        newChat: state.newChat,
        setUI: state.setUI,
        openCompare: state.openCompare,
        updateChatSettings: state.updateChatSettings,
      }),
      shallow,
    );
  const chat = chats.find((c) => c.id === selectedChatId);
  const uiState = useChatStore((s) => s.ui, shallow);
  const experimentalTutor = !!uiState.experimentalTutor;
  const forceTutorMode = !!uiState.forceTutorMode;
  const nextTutorMode = !!uiState.nextTutorMode;
  const tutorDefaultModelId = uiState.tutorDefaultModelId;
  const models = useChatStore((s) => s.models);
  const tutorActive = experimentalTutor && (forceTutorMode || (!!chat ? !!chat.settings?.tutor_mode : nextTutorMode));
  const tutorModelId = chat?.settings?.tutor_default_model || chat?.settings?.model || tutorDefaultModelId;
  const tutorModelMeta = useMemo(() => findModelById(models, tutorModelId), [models, tutorModelId]);
  const tutorModelLabel = useMemo(
    () => (tutorModelId ? formatModelLabel({ model: tutorModelMeta, fallbackId: tutorModelId }) : ''),
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

  const renameCurrentChat = () => {
    if (!chat) return;
    const next = window.prompt('Rename chat', chat.title || 'Untitled chat');
    const trimmed = (next || '').trim();
    if (!trimmed || trimmed === chat.title) return;
    renameChat(chat.id, trimmed).catch(() => void 0);
  };

  return (
    <header className="mobile-app-bar">
      <div className="mobile-app-bar-grid">
        <button
          className="icon-button"
          aria-label="Show chats"
          onClick={() => setUI({ sidebarCollapsed: false })}
        >
          <Bars3Icon className="h-4 w-4" />
        </button>
        <div className="mobile-app-bar-center">
          <div className="mobile-app-bar-title" title={chat?.title || 'Untitled chat'}>
            {chat?.title || 'Untitled chat'}
          </div>
          {tutorActive ? (
            <div className="badge gap-1 px-3 py-1 text-xs">
              <AcademicCapIcon className="h-3.5 w-3.5" />
              <span>Tutor</span>
              {tutorModelLabel && (
                <span className="text-muted-foreground">({tutorModelLabel})</span>
              )}
            </div>
          ) : (
            <ModelPicker variant="sheet" className="mobile-model-trigger" />
          )}
        </div>
        {experimentalTutor && (
          <button
            className={`icon-button ${tutorActive ? 'text-primary' : ''}`}
            aria-pressed={tutorActive}
            onClick={async () => {
              if (forceTutorMode) return;
              if (chat) {
                await updateChatSettings({ tutor_mode: !chat.settings.tutor_mode });
              } else {
                setUI({ nextTutorMode: !nextTutorMode });
              }
            }}
            disabled={forceTutorMode}
            title={forceTutorMode ? 'Tutor Mode is enforced in settings' : tutorActive ? 'Disable Tutor Mode' : 'Enable Tutor Mode'}
          >
            <AcademicCapIcon className="h-4 w-4" />
          </button>
        )}
        <button
          className="icon-button"
          aria-label="More"
          aria-expanded={menuOpen}
          onClick={() => {
            if (ignoreAnchorClickRef.current) {
              ignoreAnchorClickRef.current = false;
              return;
            }
            setMenuOpen((value) => !value);
          }}
          ref={anchorRef}
        >
          <EllipsisVerticalIcon className="h-4 w-4" />
        </button>
      </div>

      {menuOpen &&
        popoverPos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-[90]" role="presentation">
            <button
              type="button"
              className="absolute inset-0"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
            />
            <div
              ref={sheetRef}
              className="card p-2 popover z-[92] fixed mobile-menu-popover"
              style={{ left: popoverPos.left, top: popoverPos.top, width: popoverPos.width }}
              role="menu"
              aria-label="Quick actions"
            >
              <div className="flex items-center justify-between gap-2 px-2 pb-2">
                <span className="text-sm font-semibold">Quick actions</span>
                <button
                  className="icon-button"
                  aria-label="Close"
                  onClick={() => setMenuOpen(false)}
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  className="mobile-menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    newChat();
                  }}
                >
                  <PlusIcon className="h-4 w-4" />
                  <span>New chat</span>
                </button>
                {chat && (
                  <button
                    type="button"
                    className="mobile-menu-item"
                    onClick={() => {
                      setMenuOpen(false);
                      renameCurrentChat();
                    }}
                  >
                    <PencilSquareIcon className="h-4 w-4" />
                    <span>Rename chat</span>
                  </button>
                )}
                <button
                  type="button"
                  className="mobile-menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    try {
                      import('@/components/CompareDrawer');
                    } catch {}
                    openCompare();
                  }}
                >
                  <Squares2X2Icon className="h-4 w-4" />
                  <span>Compare models</span>
                </button>
                <ThemeToggle variant="menu" className="mobile-theme-item" />
                <button
                  type="button"
                  className="mobile-menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    setUI({ showSettings: true });
                    try {
                      import('@/components/SettingsDrawer');
                    } catch {}
                  }}
                >
                  <Cog6ToothIcon className="h-4 w-4" />
                  <span>Settings</span>
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </header>
  );
}
