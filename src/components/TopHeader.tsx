'use client';
import ModelPicker from '@/components/ModelPicker';
import ThemeToggle from '@/components/ThemeToggle';
import { useChatStore } from '@/lib/store';
import { shallow } from 'zustand/shallow';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  Squares2X2Icon,
  Cog6ToothIcon,
  EllipsisVerticalIcon,
  AcademicCapIcon,
} from '@heroicons/react/24/outline';
import { useMemo, useEffect, useRef, useState } from 'react';
import { findModelById, formatModelLabel } from '@/lib/models';
export default function TopHeader() {
  const { chats, selectedChatId, renameChat, setUI, openCompare, newChat, updateChatSettings } =
    useChatStore(
      (s) => ({
        chats: s.chats,
        selectedChatId: s.selectedChatId,
        renameChat: s.renameChat,
        setUI: s.setUI,
        openCompare: s.openCompare,
        newChat: s.newChat,
        updateChatSettings: s.updateChatSettings,
      }),
      shallow,
    );
  const chat = chats.find((c) => c.id === selectedChatId);
  const { collapsed, isSettingsOpen } = useChatStore(
    (s) => ({ collapsed: s.ui.sidebarCollapsed ?? false, isSettingsOpen: s.ui.showSettings }),
    shallow,
  );
  const uiState = useChatStore((s) => s.ui, shallow);
  const models = useChatStore((s) => s.models);
  const experimentalTutor = !!uiState.experimentalTutor;
  const forceTutorMode = !!uiState.forceTutorMode;
  const nextTutorMode = !!uiState.nextTutorMode;
  const tutorDefaultModelId = uiState.tutorDefaultModelId;
  const tutorActive = experimentalTutor && (forceTutorMode || (!!chat ? !!chat.settings?.tutor_mode : nextTutorMode));
  const tutorModelId = chat?.settings?.tutor_default_model || chat?.settings?.model || tutorDefaultModelId;
  const tutorModelMeta = useMemo(() => findModelById(models, tutorModelId), [models, tutorModelId]);
  const tutorModelLabel = useMemo(
    () => (tutorModelId ? formatModelLabel({ model: tutorModelMeta, fallbackId: tutorModelId }) : ''),
    [tutorModelMeta, tutorModelId],
  );

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [menuTop, setMenuTop] = useState<number | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    const update = () => {
      if (!menuButtonRef.current) return;
      const rect = menuButtonRef.current.getBoundingClientRect();
      const scrollY = typeof window !== 'undefined' ? window.scrollY : 0;
      setMenuTop(rect.bottom + 12 + scrollY);
    };
    update();
    window.addEventListener('resize', update);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('resize', update);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileMenuOpen]);

  const renameCurrentChat = () => {
    if (!chat) return;
    const next = window.prompt('Rename chat', chat.title || 'Untitled chat');
    const trimmed = (next || '').trim();
    if (!trimmed || trimmed === chat.title) return;
    renameChat(chat.id, trimmed);
  };

  const resolvedMenuTop = useMemo(() => {
    if (menuTop == null) return undefined;
    if (typeof window === 'undefined') return menuTop;
    const viewportOffset = window.visualViewport?.offsetTop ?? 0;
    const scrollY = window.scrollY || 0;
    return Math.max(menuTop - scrollY, viewportOffset + 16);
  }, [menuTop]);

  const toggleMobileMenu = () => {
    if (!mobileMenuOpen && menuButtonRef.current) {
      const rect = menuButtonRef.current.getBoundingClientRect();
      const scrollY = typeof window !== 'undefined' ? window.scrollY : 0;
      setMenuTop(rect.bottom + 12 + scrollY);
    }
    setMobileMenuOpen((v) => !v);
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

      <div className="order-2 flex-1 min-w-0 w-full sm:w-auto">
        {tutorActive ? (
          <div className="badge px-3 py-2 flex items-center gap-2 text-sm">
            <AcademicCapIcon className="h-4 w-4 text-primary" />
            <span className="font-medium">Tutor</span>
            {tutorModelLabel && (
              <span className="text-muted-foreground truncate">({tutorModelLabel})</span>
            )}
          </div>
        ) : (
          <ModelPicker />
        )}
      </div>

      <div className="order-3 ml-auto flex items-center gap-2">
        {experimentalTutor && (
          <button
            className={`btn shrink-0 ${tutorActive ? 'btn-primary' : 'btn-outline'}`}
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
            <AcademicCapIcon className="h-5 w-5" />
            <span className="hidden sm:inline ml-1">{tutorActive ? 'Tutor On' : 'Tutor Off'}</span>
          </button>
        )}
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
        <div className="sm:hidden">
          <button
            ref={menuButtonRef}
            className="btn btn-ghost"
            aria-label="More actions"
            aria-expanded={mobileMenuOpen}
            onClick={toggleMobileMenu}
          >
            <EllipsisVerticalIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <>
          <button
            className="fixed inset-0 z-[90] cursor-default"
            aria-label="Close menu"
            type="button"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div
            ref={menuRef}
            className="fixed right-3 z-[95] card p-1 popover min-w-[220px]"
            style={{ top: resolvedMenuTop }}
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
            <button
              className="menu-item w-full text-left text-sm"
              type="button"
              onClick={() => {
                setUI({ sidebarCollapsed: !collapsed });
                setMobileMenuOpen(false);
              }}
            >
              {collapsed ? 'Show sidebar' : 'Hide sidebar'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
