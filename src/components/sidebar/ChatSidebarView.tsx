import { FolderRowContainer } from '@/components/sidebar/FolderRowContainer';
import { ChatRowContainer } from '@/components/sidebar/ChatRowContainer';
import { SidebarSearch } from '@/components/sidebar/SidebarSearch';
import { groupByRecency } from '@/components/sidebar/groupByRecency';
import { LogoMark } from '@/components/ui/LogoMark';
import { IconButton } from '@/components/ui/IconButton';
import { PlusIcon, FolderPlusIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { InlineTitleEdit } from '@/components/sidebar/InlineTitleEdit';
import type { ChatSidebarState } from '@/components/sidebar/useChatSidebarState';

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
  return (
    <div className={'h-full flex flex-col w-full'}>
      {!embedded && (
        <div className="app-header justify-between">
          <div className="brand">
            <LogoMark className="brand__mark" />
            {!collapsed && <span className="brand__name">Dialogia</span>}
          </div>
          <div className="flex items-center gap-2">
            <IconButton onClick={onNewChat} title="New chat" className="w-11 h-11 sm:w-9 sm:h-9">
              <PlusIcon className="h-5 w-5 sm:h-4 sm:w-4" />
            </IconButton>
            {!collapsed && (
              <IconButton
                onClick={onStartCreateFolder}
                title="Create folder"
                className="w-11 h-11 sm:w-9 sm:h-9"
              >
                <FolderPlusIcon className="h-5 w-5 sm:h-4 sm:w-4" />
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
            <IconButton onClick={onStartCreateFolder} title="Create folder">
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
          <section className="sidebar-group" aria-label="Folders">
            {!collapsed && <h3 className="sidebar-group__label">Folders</h3>}
            {showCreateFolder && !collapsed && (
              <div className="chat-item folder-row is-editing flex items-center gap-2 px-4 py-2">
                <ChevronRightIcon className="folder-row__chevron" aria-hidden="true" />
                <InlineTitleEdit
                  value=""
                  placeholder="Folder name"
                  ariaLabel="New folder name"
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
            <p className="sidebar-empty">No chats match “{query.trim()}”.</p>
          )}
      </div>
    </div>
  );
}
