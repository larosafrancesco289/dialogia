import {
  ChevronLeftIcon,
  ChevronRightIcon,
  Cog6ToothIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import { ThemeToggle } from '@/components/ThemeToggle';
import { TopHeaderMobileMenu } from '@/components/top-header/MobileMenu';
import { ModuleSlot } from '@/components/ModuleSlot';
import { HeaderDivider } from '@/components/top-header/HeaderDivider';
import { ModelPickerTrigger } from '@/components/top-header/ModelPickerTrigger';
import type { TopHeaderState } from '@/components/top-header/useTopHeaderState';

export function TopHeaderView({
  chat,
  collapsed,
  isSettingsOpen,
  tutorActive,
  tutorModelId,
  tutorModelLabel,
  onToggleSidebar,
  onToggleSettings,
  onOpenSettings,
  onNewChat,
  onRenameChat,
}: TopHeaderState) {
  const headerClass = `app-header top-header ${tutorActive ? 'top-header--tutor-active' : ''}`;

  return (
    <div className={headerClass}>
      {/* Main row */}
      <div className="top-header__main">
        {/* Sidebar toggle */}
        <button
          className="btn btn-ghost shrink-0"
          aria-label="Toggle sidebar"
          onClick={onToggleSidebar}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRightIcon className="h-5 w-5" />
          ) : (
            <ChevronLeftIcon className="h-5 w-5" />
          )}
        </button>

        <HeaderDivider />

        {/* Center content: Model picker (read-only when tutor active) */}
        <div className="top-header__center">
          <ModelPickerTrigger
            tutorActive={tutorActive}
            tutorModelId={tutorModelId}
            tutorModelLabel={tutorModelLabel}
          />
        </div>

        <HeaderDivider />

        <ModuleSlot slot="headerControls" />

        {/* Subtle controls row */}
        <div className="header-controls">
          <button
            className="btn btn-ghost shrink-0 hide-on-mobile"
            aria-label="New chat"
            title="New chat"
            onClick={onNewChat}
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
            onClick={onToggleSettings}
            onMouseEnter={() => {
              import('@/components/settings/SettingsDrawer').catch(() => undefined);
            }}
            onFocus={() => {
              import('@/components/settings/SettingsDrawer').catch(() => undefined);
            }}
          >
            <Cog6ToothIcon className="h-5 w-5" />
          </button>
          <TopHeaderMobileMenu
            hasChat={!!chat}
            collapsed={collapsed}
            onNewChat={onNewChat}
            onRenameChat={chat ? onRenameChat : undefined}
            onOpenSettings={onOpenSettings}
            onToggleSidebar={onToggleSidebar}
          />
        </div>
      </div>
    </div>
  );
}
