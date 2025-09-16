'use client';
import ModelPicker from '@/components/ModelPicker';
import { useChatStore } from '@/lib/store';
import { shallow } from 'zustand/shallow';
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from '@heroicons/react/24/outline';
import ThemeToggle from '@/components/ThemeToggle';
import { Squares2X2Icon } from '@heroicons/react/24/outline';
import { Cog6ToothIcon } from '@heroicons/react/24/outline';
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline';
import { useEffect, useRef, useState } from 'react';
import { useDebouncedCallback } from '@/lib/hooks/useDebouncedCallback';

export default function TopHeader() {
  // Use granular selectors to avoid unnecessary re-renders
  const { chats, selectedChatId, renameChat, setUI, openCompare, newChat } = useChatStore(
    (s) => ({
      chats: s.chats,
      selectedChatId: s.selectedChatId,
      renameChat: s.renameChat,
      setUI: s.setUI,
      openCompare: s.openCompare,
      newChat: s.newChat,
    }),
    shallow,
  );
  const chat = chats.find((c) => c.id === selectedChatId);
  const { collapsed, isSettingsOpen } = useChatStore(
    (s) => ({ collapsed: s.ui.sidebarCollapsed ?? false, isSettingsOpen: s.ui.showSettings }),
    shallow,
  );
  const [title, setTitle] = useState(chat?.title || '');
  useEffect(() => setTitle(chat?.title || ''), [chat?.id, chat?.title]);
  const save = useDebouncedCallback((text: string) => {
    if (!chat) return;
    const t = (text || '').trim();
    if (!t || t === chat.title) return;
    renameChat(chat.id, t);
  }, 400);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const displayTitle = (title || chat?.title || '').trim() || 'Untitled chat';

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (menuRef.current && menuRef.current.contains(target)) return;
      if (menuButtonRef.current && menuButtonRef.current.contains(target)) return;
      setMobileMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [mobileMenuOpen]);

  const renameCurrentChat = () => {
    if (!chat) return;
    const next = window.prompt('Rename chat', title || chat.title || 'Untitled chat');
    const trimmed = (next || '').trim();
    if (!trimmed || trimmed === chat.title) return;
    setTitle(trimmed);
    renameChat(chat.id, trimmed);
  };

  return (
    <div className="app-header gap-3 flex-wrap sm:flex-nowrap top-header">
      <button
        className="btn btn-ghost shrink-0"
        aria-label="Toggle sidebar"
        onClick={() => setUI({ sidebarCollapsed: !collapsed })}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? (
          <ChevronRightIcon className="h-5 w-5" />
        ) : (
          <ChevronLeftIcon className="h-5 w-5" />
        )}
      </button>
      <div className="order-3 sm:order-2 relative flex-1 min-w-0 w-full sm:w-auto">
        <ModelPicker />
      </div>
      {chat && (
        <div className="order-4 sm:hidden w-full text-sm font-medium text-muted-foreground truncate">
          {displayTitle}
        </div>
      )}
      {chat && (
        <input
          className="order-5 input flex-1 min-w-0 max-w-full hidden sm:block"
          aria-label="Chat title"
          placeholder="Untitled chat"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            save(e.target.value);
          }}
          onBlur={() => save.flush(title)}
        />
      )}
      <div className="order-2 sm:order-3 ml-auto flex items-center gap-2">
        {/* New Chat action, accessible even when sidebar is collapsed */}
        <button
          className="btn btn-ghost shrink-0 hide-on-mobile"
          aria-label="New chat"
          title="New chat"
          onClick={() => {
            newChat();
            setMobileMenuOpen(false);
          }}
        >
          <PlusIcon className="h-5 w-5" />
        </button>
        <div className="hide-on-mobile">
          <ThemeToggle />
        </div>
        <button
          className="btn btn-ghost hide-on-mobile"
          aria-label="Open compare"
          onClick={() => openCompare()}
          onMouseEnter={() => {
            try {
              import('@/components/CompareDrawer');
            } catch {}
          }}
          onFocus={() => {
            try {
              import('@/components/CompareDrawer');
            } catch {}
          }}
          title="Compare models"
        >
          <Squares2X2Icon className="h-5 w-5" />
        </button>
        <button
          className="btn btn-ghost hide-on-mobile"
          aria-label="Open settings"
          aria-pressed={isSettingsOpen}
          onClick={() => setUI({ showSettings: !isSettingsOpen })}
          onMouseEnter={() => {
            try {
              import('@/components/SettingsDrawer');
            } catch {}
          }}
          onFocus={() => {
            try {
              import('@/components/SettingsDrawer');
            } catch {}
          }}
        >
          <Cog6ToothIcon className="h-5 w-5" />
        </button>
        <div className="relative sm:hidden">
          <button
            ref={menuButtonRef}
            className="btn btn-ghost"
            aria-label="More actions"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((v) => !v)}
          >
            <EllipsisVerticalIcon className="h-5 w-5" />
          </button>
          {mobileMenuOpen && (
            <div
              ref={menuRef}
              className="absolute right-0 top-full mt-2 z-40 card p-1 popover min-w-[200px]"
              role="menu"
            >
              <button
                className="menu-item w-full text-left text-sm"
                type="button"
                onClick={() => {
                  newChat();
                  setMobileMenuOpen(false);
                }}
              >
                New chat
              </button>
              {chat && (
                <button
                  className="menu-item w-full text-left text-sm"
                  type="button"
                  onClick={() => {
                    renameCurrentChat();
                    setMobileMenuOpen(false);
                  }}
                >
                  Rename chat
                </button>
              )}
              <button
                className="menu-item w-full text-left text-sm"
                type="button"
                onClick={() => {
                  openCompare();
                  setMobileMenuOpen(false);
                }}
              >
                Compare models
              </button>
              <ThemeToggle
                variant="menu"
                onToggle={() => setMobileMenuOpen(false)}
                className="text-sm"
              />
              <button
                className="menu-item w-full text-left text-sm"
                type="button"
                onClick={() => {
                  setUI({ showSettings: true });
                  setMobileMenuOpen(false);
                }}
              >
                Settings
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
