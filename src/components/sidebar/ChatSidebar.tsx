'use client';
import { useEffect, useState } from 'react';
import { useChatStore } from '@/lib/store';
import { shallow } from 'zustand/shallow';
import { useDragAndDrop } from '@/lib/dragDrop';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { FolderRow } from '@/components/sidebar/FolderRow';
import { ChatRow } from '@/components/sidebar/ChatRow';
import { SidebarSearch } from '@/components/sidebar/SidebarSearch';
import { IconButton } from '@/components/IconButton';
import { ThemeToggle } from '@/components/ThemeToggle';
import { PlusIcon, FolderPlusIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { Cog6ToothIcon } from '@heroicons/react/24/outline';
// Settings gear moved to the top header

interface ChatSidebarProps {
  /** Override collapsed state (defaults to store value) */
  collapsed?: boolean;
}

export function ChatSidebar({ collapsed: collapsedProp }: ChatSidebarProps = {}) {
  const {
    chats,
    folders,
    selectedChatId,
    selectChat,
    newChat,
    renameChat,
    deleteChat,
    loadModels,
    createFolder,
    moveChatToFolder,
    collapsedFromStore,
  } = useChatStore(
    (s) => ({
      chats: s.chats,
      folders: s.folders,
      selectedChatId: s.selectedChatId,
      selectChat: s.selectChat,
      newChat: s.newChat,
      renameChat: s.renameChat,
      deleteChat: s.deleteChat,
      loadModels: s.loadModels,
      createFolder: s.createFolder,
      moveChatToFolder: s.moveChatToFolder,
      collapsedFromStore: s.ui.sidebarCollapsed ?? false,
    }),
    shallow,
  );

  // Use prop if provided, otherwise use store value
  const collapsed = collapsedProp ?? collapsedFromStore;

  const { handleDragOver, handleDrop, handleDragStart, handleDragEnd, getDragData } =
    useDragAndDrop();
  // Settings button removed from sidebar header
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [query, setQuery] = useState('');
  const isMobile = useIsMobile();
  const isTablet = useIsMobile(768);
  // no global swipe state; long-press opens action sheet per-row

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  // Get top-level folders and root-level chats
  const rootFolders = folders.filter((f) => !f.parentId);
  const rootChats = chats.filter((c) => !c.folderId);

  // Simple name matcher
  const match = (text?: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (text || '').toLowerCase().includes(q);
  };
  const folderMatches = (folderId: string): boolean => {
    const f = folders.find((x) => x.id === folderId);
    if (!f) return false;
    if (match(f.name)) return true;
    const subFolders = folders.filter((x) => x.parentId === folderId);
    const hasChat = chats.some((c) => c.folderId === folderId && match(c.title));
    return hasChat || subFolders.some((sf) => folderMatches(sf.id));
  };

  const handleCreateFolder = async () => {
    if (newFolderName.trim()) {
      await createFolder(newFolderName.trim());
      setNewFolderName('');
      setShowCreateFolder(false);
    }
  };

  // Fill the aside; width is controlled by grid column in `app-shell`
  return (
    <div className={'h-full flex flex-col w-full'}>
      <div className="app-header justify-between">
        <div className="flex items-center gap-2 font-semibold text-fg">
          <div className="relative w-8 h-8 rounded-lg overflow-hidden shrink-0 border border-border/50 shadow-sm">
            <img
              src="/logo.jpg"
              alt="App Logo"
              className="w-full h-full object-cover logo-enhanced"
            />
          </div>
          {!collapsed && <span className="tracking-tight">Dialogia</span>}
        </div>
        <div className="flex items-center gap-2">
          <IconButton
            onClick={() => newChat()}
            title="New Chat"
            variant="ghost"
            className="w-11 h-11 sm:w-9 sm:h-9"
          >
            <PlusIcon className="h-5 w-5 sm:h-3.5 sm:w-3.5" />
          </IconButton>
          {!collapsed && (
            <IconButton
              onClick={() => setShowCreateFolder(true)}
              title="Create folder"
              variant="ghost"
              className="w-11 h-11 sm:w-9 sm:h-9"
            >
              <FolderPlusIcon className="h-5 w-5 sm:h-3.5 sm:w-3.5" />
            </IconButton>
          )}
          {/* Mobile-only: theme, settings, close sidebar */}
          <span className="sm:hidden flex items-center gap-2">
            <ThemeToggle />
            <IconButton
              onClick={() => {
                useChatStore
                  .getState()
                  .setUI({ showSettings: true, ...(isTablet ? { sidebarCollapsed: true } : {}) });
              }}
              title="Settings"
              variant="ghost"
              className="w-11 h-11"
            >
              <Cog6ToothIcon className="h-5 w-5" />
            </IconButton>
            <IconButton
              onClick={() => useChatStore.getState().setUI({ sidebarCollapsed: true })}
              title="Close sidebar"
              variant="ghost"
              className="w-11 h-11"
            >
              <XMarkIcon className="h-5 w-5" />
            </IconButton>
          </span>
        </div>
      </div>

      {/* Create folder input */}
      {showCreateFolder && !collapsed && (
        <div className="sidebar-section pb-3">
          <div className="flex gap-2">
            <input
              className="input flex-1 text-base sm:text-sm"
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder();
                if (e.key === 'Escape') {
                  setShowCreateFolder(false);
                  setNewFolderName('');
                }
              }}
              autoFocus
            />
            <IconButton size="sm" onClick={handleCreateFolder} title="Create folder">
              <CheckIcon className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton
              size="sm"
              onClick={() => {
                setShowCreateFolder(false);
                setNewFolderName('');
              }}
              title="Cancel"
            >
              <XMarkIcon className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        </div>
      )}

      {/* Search */}
      <SidebarSearch value={query} onChange={setQuery} collapsed={collapsed} />

      {/* Drop zone for root level */}
      <div
        className={`scroll-area flex-1 sidebar-section`}
        onDragOver={handleDragOver}
        onDrop={async (e) => {
          e.preventDefault();
          const dragData = getDragData();
          if (dragData && dragData.type === 'chat') {
            await handleDrop(undefined);
          }
        }}
      >
        {/* Root folders */}
        {rootFolders
          .filter((folder) => (query ? folderMatches(folder.id) : true))
          .map((folder) => (
            <FolderRow key={folder.id} folder={folder} />
          ))}

        {/* Root chats */}
        {rootChats
          .filter((chat) => (query ? match(chat.title) : true))
          .map((chat) => (
            <ChatRow
              key={chat.id}
              chat={chat}
              collapsed={collapsed}
              isMobile={isMobile}
              isSelected={selectedChatId === chat.id}
              isEditing={editingId === chat.id}
              editTitle={editTitle}
              onSelect={() => selectChat(chat.id)}
              onStartEdit={() => {
                setEditingId(chat.id);
                setEditTitle(chat.title);
              }}
              onSaveEdit={async () => {
                await renameChat(chat.id, editTitle || chat.title);
                setEditingId(null);
              }}
              onCancelEdit={() => setEditingId(null)}
              onDelete={() => deleteChat(chat.id)}
              onEditTitleChange={setEditTitle}
              folders={folders}
              moveChatToFolder={moveChatToFolder}
              onDragStart={(id) => handleDragStart(id, 'chat')}
              onDragEnd={handleDragEnd}
            />
          ))}
      </div>
      {/* Per-item delete confirmation handled inside ChatRow */}
    </div>
  );
}
