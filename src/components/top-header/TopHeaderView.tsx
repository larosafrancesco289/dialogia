import { BookmarkIcon, Cog6ToothIcon, DocumentPlusIcon } from '@heroicons/react/24/outline';
import { ModuleSlot } from '@/components/ModuleSlot';
import { SidebarIcon } from '@/components/ui/icons';
import { HeaderDivider } from '@/components/top-header/HeaderDivider';
import { ModelPickerTrigger } from '@/components/top-header/ModelPickerTrigger';
import type { TopHeaderState } from '@/components/top-header/useTopHeaderState';
import { useT } from '@/lib/i18n';

export function TopHeaderView({
  collapsed,
  isSettingsOpen,
  isMemoryOpen,
  tutorActive,
  tutorModelLabel,
  onToggleSidebar,
  onToggleSettings,
  onToggleMemory,
  onNewChat,
}: TopHeaderState) {
  const t = useT();
  const headerClass = 'app-header top-header';

  return (
    <div className={headerClass}>
      {/* Main row */}
      <div className="top-header__main">
        {/* Sidebar toggle */}
        <button
          className="icon-button icon-button--lg"
          aria-label={t('header.toggleSidebar')}
          aria-expanded={!collapsed}
          onClick={onToggleSidebar}
          title={t(collapsed ? 'header.expandSidebar' : 'header.collapseSidebar')}
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
              className="icon-button icon-button--lg hide-on-mobile"
              aria-label={t('sidebar.newChat')}
              title={t('sidebar.newChat')}
              data-action="new-chat"
              onClick={onNewChat}
            >
              <DocumentPlusIcon className="h-5 w-5" />
            </button>
          )}
          <button
            className="icon-button icon-button--lg hide-on-mobile"
            aria-label={t('header.openMemory')}
            title={t('nav.memory')}
            aria-pressed={isMemoryOpen}
            onClick={onToggleMemory}
            onMouseEnter={() => {
              import('@/components/memory/MemoryPage').catch(() => undefined);
            }}
            onFocus={() => {
              import('@/components/memory/MemoryPage').catch(() => undefined);
            }}
          >
            <BookmarkIcon className="h-5 w-5" />
          </button>
          <button
            className="icon-button icon-button--lg hide-on-mobile"
            aria-label={t('header.openSettings')}
            title={t('nav.settings')}
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
