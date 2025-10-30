'use client';
import { ModelPicker } from '@/components/ModelPicker';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useChatStore } from '@/lib/store';
import { shallow } from 'zustand/shallow';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  Cog6ToothIcon,
  AcademicCapIcon,
  ClipboardDocumentListIcon,
  SparklesIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { useMemo, useState } from 'react';
import { TopHeaderMobileMenu } from '@/components/top-header/MobileMenu';
import { findModelById, formatModelLabel } from '@/lib/models';
import { PlanSheet } from '@/components/plan/PlanSheet';
import { calculatePlanProgress, getNextNode } from '@/lib/agent/planGenerator';
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
  const { collapsed, isSettingsOpen, planSheetOpen } = useChatStore(
    (s) => ({
      collapsed: s.ui.sidebarCollapsed ?? false,
      isSettingsOpen: s.ui.showSettings,
      planSheetOpen: s.ui.planSheetOpen ?? false,
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

  // Learning plan state
  const learningPlan = chat?.settings?.learningPlan;
  const hasPlan = !!learningPlan;
  const planProgress = useMemo(
    () => (learningPlan ? calculatePlanProgress(learningPlan) : null),
    [learningPlan],
  );
  const currentNode = useMemo(
    () => (learningPlan ? getNextNode(learningPlan) : null),
    [learningPlan],
  );
  const planGeneration = useChatStore(
    (s) => (s.selectedChatId ? s.ui.planGenerationByChatId?.[s.selectedChatId] : undefined),
    shallow,
  );

  const renameCurrentChat = () => {
    if (!chat) return;
    const next = window.prompt('Rename chat', chat.title || 'Untitled chat');
    const trimmed = (next || '').trim();
    if (!trimmed || trimmed === chat.title) return;
    renameChat(chat.id, trimmed);
  };

  const handlePlanUpdate = async (updatedPlan: any) => {
    await updateChatSettings({ learningPlan: updatedPlan });
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
        {planGeneration?.status === 'loading' && (
          <div
            className="flex min-w-0 items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs shadow-[var(--shadow-card)]"
            title={planGeneration.goal || undefined}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
              <ArrowPathIcon className="h-4 w-4 text-primary animate-spin" />
            </span>
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="font-semibold uppercase tracking-wide text-primary">
                Generating plan…
              </span>
              {planGeneration.goal && (
                <span className="truncate text-[11px] text-primary/80">{planGeneration.goal}</span>
              )}
            </div>
          </div>
        )}
        {planGeneration?.status === 'error' && !hasPlan && (
          <div
            className="flex items-center gap-2 rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 shadow-[var(--shadow-card)]"
            title={planGeneration.error || 'Plan generation failed'}
          >
            <ExclamationTriangleIcon className="h-4 w-4" />
            <span>Plan generation failed</span>
          </div>
        )}
        {hasPlan && planProgress && (
          <>
            {/* Current topic badge */}
            {currentNode && (
              <div
                className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs"
                style={{
                  background: 'color-mix(in oklab, var(--color-accent-2) 15%, transparent)',
                  border: '1px solid color-mix(in oklab, var(--color-accent-2) 35%, var(--color-border))',
                }}
              >
                <SparklesIcon
                  className="h-3.5 w-3.5"
                  style={{ color: 'color-mix(in oklab, var(--color-accent-2) 80%, var(--color-fg) 20%)' }}
                />
                <span
                  className="font-medium"
                  style={{ color: 'color-mix(in oklab, var(--color-accent-2) 80%, var(--color-fg) 20%)' }}
                >
                  {currentNode.name}
                </span>
              </div>
            )}
            {/* Compact progress */}
            <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-medium">
                {planProgress.completed}/{learningPlan.nodes.length}
              </span>
              <span>•</span>
              <span>{planProgress.percentComplete}%</span>
            </div>
            {/* View Plan button */}
            <button
              className="btn btn-ghost shrink-0"
              onClick={() => setUI({ planSheetOpen: true })}
              title="View Learning Plan"
              aria-label="View Learning Plan"
            >
              <ClipboardDocumentListIcon className="h-5 w-5" />
              <span className="hidden sm:inline ml-1">Plan</span>
            </button>
          </>
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

      {/* Learning Plan Sheet */}
      <PlanSheet
        plan={learningPlan || null}
        isOpen={planSheetOpen}
        onClose={() => setUI({ planSheetOpen: false })}
        onUpdate={handlePlanUpdate}
      />
    </div>
  );
}
