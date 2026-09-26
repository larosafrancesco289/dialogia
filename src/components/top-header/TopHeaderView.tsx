import { Cog6ToothIcon, PlusIcon } from '@heroicons/react/24/outline';
import { ModuleSlot } from '@/components/ModuleSlot';
import { SidebarIcon } from '@/components/ui/icons';
import { HeaderDivider } from '@/components/top-header/HeaderDivider';
import { ModelPickerTrigger } from '@/components/top-header/ModelPickerTrigger';
import type { TopHeaderState } from '@/components/top-header/useTopHeaderState';

export function TopHeaderView({
  collapsed,
  isSettingsOpen,
  tutorActive,
  tutorModelLabel,
  onToggleSidebar,
  onToggleSettings,
  onNewChat,
}: TopHeaderState) {
  const headerClass = 'app-header top-header';

  return (
    <div className={headerClass}>
      {/* Main row */}
      <div className="top-header__main">
        {/* Sidebar toggle */}
        <button
          className="icon-button"
          aria-label="Toggle sidebar"
          aria-expanded={!collapsed}
          onClick={onToggleSidebar}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <SidebarIcon className="h-5 w-5" />
        </button>

        <HeaderDivider />

        {/* Center content: Model picker (read-only when tutor active) */}
        <div className="top-header__center">
          <ModelPickerTrigger tutorActive={tutorActive} tutorModelLabel={tutorModelLabel} />
        </div>

        <HeaderDivider />

        <ModuleSlot slot="headerControls" />

        {/* Subtle controls row */}
        <div className="header-controls">
          {/* The sidebar owns chat navigation; its new-chat button steps into
              the bar only while the sidebar is hidden. */}
          {collapsed && (
            <button
              className="icon-button hide-on-mobile"
              aria-label="New chat"
              title="New chat"
              onClick={onNewChat}
            >
              <PlusIcon className="h-5 w-5" />
            </button>
          )}
          <button
            className="icon-button hide-on-mobile"
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
        </div>
      </div>
    </div>
  );
}
