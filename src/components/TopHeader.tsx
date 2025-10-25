'use client';
import { ModelPicker } from '@/components/ModelPicker';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useChatStore } from '@/lib/store';
import { shallow } from 'zustand/shallow';
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, Cog6ToothIcon, AcademicCapIcon } from '@heroicons/react/24/outline';
import { useMemo, useState } from 'react';
import { TopHeaderMobileMenu } from '@/components/top-header/MobileMenu';
import { findModelById, formatModelLabel } from '@/lib/models';
export function TopHeader() {
  const {
    chats,
    selectedChatId,
    renameChat,
    setUI,
    newChat,
    updateChatSettings,
  } =
    useChatStore(
      (s) => ({
        chats: s.chats,
        selectedChatId: s.selectedChatId,
        renameChat: s.renameChat,
        setUI: s.setUI,
        newChat: s.newChat,
        updateChatSettings: s.updateChatSettings,
      }),
      shallow,
    );
  const chat = chats.find((c) => c.id === selectedChatId);
  const { collapsed, isSettingsOpen } = useChatStore(
    (s) => ({
      collapsed: s.ui.sidebarCollapsed ?? false,
      isSettingsOpen: s.ui.showSettings,
    }),
    shallow,
  );
  const uiState = useChatStore((s) => s.ui, shallow);
  const models = useChatStore((s) => s.models);
  const experimentalTutor = !!uiState.experimentalTutor;
  const forceTutorMode = !!uiState.forceTutorMode;
  const nextTutorMode = !!uiState.nextTutorMode;
  const tutorDefaultModelId = uiState.tutorDefaultModelId;
  const tutorActive =
    experimentalTutor && (forceTutorMode || (!!chat ? !!chat.settings?.tutor_mode : nextTutorMode));
  const tutorModelId =
    chat?.settings?.tutor_default_model || chat?.settings?.model || tutorDefaultModelId;
  const tutorModelMeta = useMemo(() => findModelById(models, tutorModelId), [models, tutorModelId]);
  const tutorModelLabel = useMemo(
    () =>
      tutorModelId ? formatModelLabel({ model: tutorModelMeta, fallbackId: tutorModelId }) : '',
    [tutorModelMeta, tutorModelId],
  );

  const renameCurrentChat = () => {
    if (!chat) return;
    const next = window.prompt('Rename chat', chat.title || 'Untitled chat');
    const trimmed = (next || '').trim();
    if (!trimmed || trimmed === chat.title) return;
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

      <div className="order-2 flex-1 min-w-0 w-full sm:w-auto">
        {tutorActive ? (
          <div className="tutor-model-pill" title={tutorModelLabel || undefined}>
            <span className="tutor-model-pill__icon">
              <AcademicCapIcon className="h-5 w-5" />
            </span>
            <div className="tutor-model-pill__text">
              <span className="tutor-model-pill__label">Tutor</span>
              {tutorModelLabel && (
                <span className="tutor-model-pill__model">{tutorModelLabel}</span>
              )}
            </div>
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
            title={
              forceTutorMode
                ? 'Tutor Mode is enforced in settings'
                : tutorActive
                  ? 'Disable Tutor Mode'
                  : 'Enable Tutor Mode'
            }
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
          }}
        >
          <PlusIcon className="h-5 w-5" />
        </button>
        <div className="hide-on-mobile">
          <ThemeToggle />
        </div>
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
        <TopHeaderMobileMenu
          hasChat={!!chat}
          collapsed={collapsed}
          onNewChat={newChat}
          onRenameChat={chat ? renameCurrentChat : undefined}
          onOpenSettings={() => setUI({ showSettings: true })}
          onToggleSidebar={() => setUI({ sidebarCollapsed: !collapsed })}
        />
      </div>
    </div>
  );
}
