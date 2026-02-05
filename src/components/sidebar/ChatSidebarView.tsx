import Image from 'next/image';
import { FolderRowContainer } from '@/components/sidebar/FolderRowContainer';
import { ChatRowContainer } from '@/components/sidebar/ChatRowContainer';
import { SidebarSearch } from '@/components/sidebar/SidebarSearch';
import { IconButton } from '@/components/ui/IconButton';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  PlusIcon,
  FolderPlusIcon,
  CheckIcon,
  XMarkIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';
import type { ChatSidebarState } from '@/components/sidebar/useChatSidebarState';

export function ChatSidebarView({
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
  onOpenSettings,
  onCloseSidebar,
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
}: ChatSidebarState) {
  return (
    <div className={'h-full flex flex-col w-full'}>
      <div className="app-header justify-between">
        <div className="flex items-center gap-2 font-semibold text-fg">
          <div className="relative w-8 h-8 rounded-lg overflow-hidden shrink-0 border border-border/50 shadow-sm">
            <Image
              src="/logo.jpg"
              alt="App Logo"
              fill
              sizes="32px"
              className="object-cover logo-enhanced"
            />
          </div>
          {!collapsed && <span className="tracking-tight">Dialogia</span>}
        </div>
        <div className="flex items-center gap-2">
          <IconButton
            onClick={onNewChat}
            title="New Chat"
            variant="ghost"
            className="w-11 h-11 sm:w-9 sm:h-9"
          >
            <PlusIcon className="h-5 w-5 sm:h-3.5 sm:w-3.5" />
          </IconButton>
          {!collapsed && (
            <IconButton
              onClick={onStartCreateFolder}
              title="Create folder"
              variant="ghost"
              className="w-11 h-11 sm:w-9 sm:h-9"
            >
              <FolderPlusIcon className="h-5 w-5 sm:h-3.5 sm:w-3.5" />
            </IconButton>
          )}
          <span className="sm:hidden flex items-center gap-2">
            <ThemeToggle />
            <IconButton
              onClick={onOpenSettings}
              title="Settings"
              variant="ghost"
              className="w-11 h-11"
            >
              <Cog6ToothIcon className="h-5 w-5" />
            </IconButton>
            <IconButton
              onClick={onCloseSidebar}
              title="Close sidebar"
              variant="ghost"
              className="w-11 h-11"
            >
              <XMarkIcon className="h-5 w-5" />
            </IconButton>
          </span>
        </div>
      </div>

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

      <SidebarSearch value={query} onChange={onQueryChange} collapsed={collapsed} />

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
