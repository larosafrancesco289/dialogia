import { createPortal } from 'react-dom';
import {
  Bars3Icon,
  EllipsisVerticalIcon,
  PlusIcon,
  PencilSquareIcon,
  Cog6ToothIcon,
  XMarkIcon,
  AcademicCapIcon,
} from '@heroicons/react/24/outline';
import { ModelPicker } from '@/components/ModelPicker';
import { ThemeToggle } from '@/components/ThemeToggle';
import type { MobileHeaderState } from '@/components/mobile/useMobileHeaderState';

export function MobileHeaderView({
  chatTitle,
  hasChat,
  tutorActive,
  tutorModelLabel,
  showTutorToggle,
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
}: MobileHeaderState) {
  return (
    <header className="mobile-app-bar">
      <div className="mobile-app-bar-grid">
        <button className="icon-button" aria-label="Show chats" onClick={onOpenSidebar}>
          <Bars3Icon className="h-4 w-4" />
        </button>
        <div className="mobile-app-bar-center">
          <div className="mobile-app-bar-title" title={chatTitle}>
            {chatTitle}
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
        {showTutorToggle && (
          <button
            className={`icon-button ${tutorActive ? 'text-primary' : ''}`}
            aria-pressed={tutorActive}
            onClick={() => {
              void onToggleTutorMode();
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
            <AcademicCapIcon className="h-4 w-4" />
          </button>
        )}
        <button
          className="icon-button"
          aria-label="More"
          aria-expanded={menuOpen}
          onClick={onToggleMenu}
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
              onClick={onCloseMenu}
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
                <button className="icon-button" aria-label="Close" onClick={onCloseMenu}>
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  className="mobile-menu-item"
                  onClick={() => {
                    onCloseMenu();
                    onNewChat();
                  }}
                >
                  <PlusIcon className="h-4 w-4" />
                  <span>New chat</span>
                </button>
                {hasChat && (
                  <button
                    type="button"
                    className="mobile-menu-item"
                    onClick={() => {
                      onCloseMenu();
                      onRenameChat();
                    }}
                  >
                    <PencilSquareIcon className="h-4 w-4" />
                    <span>Rename chat</span>
                  </button>
                )}
                <ThemeToggle variant="menu" className="mobile-theme-item" />
                <button
                  type="button"
                  className="mobile-menu-item"
                  onClick={() => {
                    onCloseMenu();
                    onOpenSettings();
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
