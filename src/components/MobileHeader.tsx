'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
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
} from '@heroicons/react/24/outline';
import ModelPicker from '@/components/ModelPicker';
import ThemeToggle from '@/components/ThemeToggle';

export default function MobileHeader() {
  const { chats, selectedChatId, renameChat, newChat, setUI, openCompare } = useChatStore(
    (state) => ({
      chats: state.chats,
      selectedChatId: state.selectedChatId,
      renameChat: state.renameChat,
      newChat: state.newChat,
      setUI: state.setUI,
      openCompare: state.openCompare,
    }),
    shallow,
  );
  const chat = chats.find((c) => c.id === selectedChatId);
  const displayTitle = useMemo(() => {
    if (chat?.title) return chat.title;
    return 'Dialogia';
  }, [chat?.title]);

  const [menuOpen, setMenuOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (sheetRef.current && sheetRef.current.contains(target)) return;
      setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
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
          <div className="mobile-app-bar-title" title={displayTitle}>
            {displayTitle}
          </div>
          <ModelPicker variant="sheet" className="mobile-model-trigger" />
        </div>
        <button
          className="icon-button"
          aria-label="More"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
        >
          <EllipsisVerticalIcon className="h-4 w-4" />
        </button>
      </div>

      {menuOpen && (
        <div
          className="mobile-sheet-overlay"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setMenuOpen(false);
          }}
        >
          <div ref={sheetRef} className="mobile-sheet card" role="menu" aria-label="Actions">
            <div className="mobile-sheet-handle" aria-hidden="true" />
            <div className="mobile-sheet-header">
              <div className="font-semibold text-base">Quick actions</div>
              <button className="icon-button" aria-label="Close" onClick={() => setMenuOpen(false)}>
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="mobile-sheet-body" data-scrollable>
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
              <ThemeToggle
                variant="menu"
                onToggle={() => setMenuOpen(false)}
                className="mobile-theme-item"
              />
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
        </div>
      )}
    </header>
  );
}
