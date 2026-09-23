import { FolderRowContainer } from '@/components/sidebar/FolderRowContainer';
import { ChatRowContainer } from '@/components/sidebar/ChatRowContainer';
import { SidebarSearch } from '@/components/sidebar/SidebarSearch';
import { LogoMark } from '@/components/ui/LogoMark';
import { IconButton } from '@/components/ui/IconButton';
import { PlusIcon, FolderPlusIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import type { ChatSidebarState } from '@/components/sidebar/useChatSidebarState';

export function ChatSidebarView({
  embedded = false,
  collapsed,
  query,
  showCreateFolder,
  newFolderName,
  editTitle,
  editingId,
  filteredRootFolders,
  filteredRootChats,
  folderTreeIndex,
  folders,
  selectedChatId,
  isMobile,
  onQueryChange,
  onNewFolderNameChange,
  onStartCreateFolder,
  onCancelCreateFolder,
  onCreateFolder,
  onNewChat,
  onSelectChat,
  onStartEditChat,
  onSaveEditChat,
  onCancelEditChat,
  onDeleteChat,
  onEditTitleChange,
  moveChatToFolder,
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
            <IconButton onClick={onNewChat} title="New Chat" className="w-11 h-11 sm:w-9 sm:h-9">
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

      {showCreateFolder && !collapsed && (
        <div className="sidebar-section pb-3">
          <div className="flex gap-2">
            <input
              className="input flex-1 text-base sm:text-sm"
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => onNewFolderNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void onCreateFolder();
                if (e.key === 'Escape') onCancelCreateFolder();
              }}
              autoFocus
            />
            <IconButton size="sm" onClick={onCreateFolder} title="Create folder">
              <CheckIcon className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton size="sm" onClick={onCancelCreateFolder} title="Cancel">
              <XMarkIcon className="h-3.5 w-3.5" />
            </IconButton>
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
        {filteredRootFolders.map((folder) => (
          <FolderRowContainer key={folder.id} folder={folder} folderTreeIndex={folderTreeIndex} />
        ))}

        {filteredRootChats.map((chat) => (
          <ChatRowContainer
            key={chat.id}
            chat={chat}
            collapsed={collapsed}
            isMobile={isMobile}
            isSelected={selectedChatId === chat.id}
            isEditing={editingId === chat.id}
            editTitle={editTitle}
            onSelect={() => onSelectChat(chat.id)}
            onStartEdit={() => onStartEditChat(chat.id, chat.title)}
            onSaveEdit={async () => {
              await onSaveEditChat(chat.id, chat.title);
            }}
            onCancelEdit={onCancelEditChat}
            onDelete={() => onDeleteChat(chat.id)}
            onEditTitleChange={onEditTitleChange}
            folders={folders}
            moveChatToFolder={moveChatToFolder}
            onDragStart={(id) => handleDragStart(id, 'chat')}
            onDragEnd={handleDragEnd}
          />
        ))}
      </div>
    </div>
  );
}
