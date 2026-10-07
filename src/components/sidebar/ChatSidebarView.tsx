import { FolderRowContainer } from '@/components/sidebar/FolderRowContainer';
import { ChatRowContainer } from '@/components/sidebar/ChatRowContainer';
import { SidebarSearch } from '@/components/sidebar/SidebarSearch';
import { groupByRecency } from '@/components/sidebar/groupByRecency';
import { LogoMark } from '@/components/ui/LogoMark';
import { IconButton } from '@/components/ui/IconButton';
import { DocumentPlusIcon, FolderPlusIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { InlineTitleEdit } from '@/components/sidebar/InlineTitleEdit';
import type { ChatSidebarState } from '@/components/sidebar/useChatSidebarState';
import { useT } from '@/lib/i18n';

export function ChatSidebarView({
  embedded = false,
  collapsed,
  query,
  showCreateFolder,
  filteredRootFolders,
  filteredRootChats,
  folderTreeIndex,
  selectedChatId,
  isMobile,
  onQueryChange,
  onStartCreateFolder,
  onCancelCreateFolder,
  onCreateFolder,
  onNewChat,
  onSelectChat,
  handleDragStart,
  handleDragEnd,
  handleDragOver,
  handleRootDrop,
}: ChatSidebarState & { embedded?: boolean }) {
  const t = useT();
  return (
    <div className={'h-full flex flex-col w-full'}>
      {!embedded && (
        <div className="app-header justify-between">
          <div className="brand">
            <LogoMark className="brand__mark" />
            {!collapsed && <span className="brand__name">Dialogia</span>}
          </div>
          <div className="flex items-center gap-2">
            <IconButton
              onClick={onNewChat}
              title={t('sidebar.newChat')}
              action="new-chat"
              className="w-11 h-11 sm:w-9 sm:h-9"
            >
              <DocumentPlusIcon className="h-5 w-5" />
            </IconButton>
            {!collapsed && (
              <IconButton
                onClick={onStartCreateFolder}
                title={t('sidebar.createFolder')}
                className="w-11 h-11 sm:w-9 sm:h-9"
              >
                <FolderPlusIcon className="h-5 w-5" />
              </IconButton>
            )}
          </div>
        </div>
      )}

      <SidebarSearch
        value={query}
        onChange={onQueryChange}
        collapsed={collapsed}
        action={
          embedded ? (
            <IconButton onClick={onStartCreateFolder} title={t('sidebar.createFolder')}>
              <FolderPlusIcon className="h-5 w-5" />
            </IconButton>
          ) : undefined
        }
      />

      <div
        className="scroll-area flex-1 sidebar-section"
        onDragOver={handleDragOver}
        onDrop={handleRootDrop}
      >
        {(filteredRootFolders.length > 0 || (showCreateFolder && !collapsed)) && (
          <section className="sidebar-group" aria-label={t('sidebar.folders')}>
            {!collapsed && <h3 className="sidebar-group__label">{t('sidebar.folders')}</h3>}
            {showCreateFolder && !collapsed && (
              // tabIndex -1, as an editing row has: Enter or Escape leaves focus
              // here, not on whatever holds the list, until the row is gone.
              <div
                className="chat-item folder-row is-editing flex items-center gap-2 px-4 py-2"
                tabIndex={-1}
              >
                <ChevronRightIcon className="folder-row__chevron" aria-hidden="true" />
                <InlineTitleEdit
                  value=""
                  placeholder={t('folder.namePlaceholder')}
                  ariaLabel={t('folder.newName')}
                  onCommit={onCreateFolder}
                  onCancel={onCancelCreateFolder}
                />
              </div>
            )}
            {filteredRootFolders.map((folder) => (
              <FolderRowContainer
                key={folder.id}
                folder={folder}
                folderTreeIndex={folderTreeIndex}
                query={query.trim().toLowerCase()}
              />
            ))}
          </section>
        )}

        {groupByRecency(filteredRootChats).map((group) => (
          <section key={group.label} className="sidebar-group" aria-label={group.label}>
            {!collapsed && <h3 className="sidebar-group__label">{group.label}</h3>}
            {group.chats.map((chat) => (
              <ChatRowContainer
                key={chat.id}
                chat={chat}
                collapsed={collapsed}
                isMobile={isMobile}
                isSelected={selectedChatId === chat.id}
                onSelect={() => onSelectChat(chat.id)}
                onDragStart={(id) => handleDragStart(id, 'chat')}
                onDragEnd={handleDragEnd}
              />
            ))}
          </section>
        ))}

        {!collapsed &&
          query.trim() &&
          filteredRootFolders.length === 0 &&
          filteredRootChats.length === 0 && (
            <p className="sidebar-empty">{t('sidebar.noMatch', { query: query.trim() })}</p>
          )}
      </div>
    </div>
  );
}
