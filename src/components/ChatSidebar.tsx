'use client';
import { useEffect, useState } from 'react';
import { useChatStore } from '@/lib/store';
import { useDragAndDrop, setCurrentDragData, getCurrentDragData } from '@/lib/dragDrop';
import FolderItem from './FolderItem';
import IconButton from './IconButton';
import { PlusIcon, FolderPlusIcon, MessageIcon, EditIcon, TrashIcon, CheckIcon, XIcon } from './icons/Icons';
import type { Chat } from '@/lib/types';
// Settings gear moved to the top header

export default function ChatSidebar() {
  const { 
    chats, 
    folders, 
    selectedChatId, 
    selectChat, 
    newChat, 
    renameChat, 
    deleteChat, 
    loadModels,
    createFolder 
  } = useChatStore();
  const collapsed = useChatStore((s) => s.ui.sidebarCollapsed ?? false);
  
  const { handleDragOver, handleDrop } = useDragAndDrop();
  // Settings button removed from sidebar header
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  // Get top-level folders and root-level chats
  const rootFolders = folders.filter(f => !f.parentId);
  const rootChats = chats.filter(c => !c.folderId);

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
      <div className="app-header">
        <div className="font-semibold">{collapsed ? 'Dg' : 'Dialogia'}</div>
      </div>

      <div className="sidebar-section py-3 flex gap-2 justify-center">
        <IconButton
          onClick={() => newChat()}
          title="New Chat"
          variant="subtle"
          className="h-9 w-9 bg-muted/70 hover:bg-muted text-fg"
        >
          <PlusIcon size={14} />
        </IconButton>
        {!collapsed && (
          <IconButton
            onClick={() => setShowCreateFolder(true)}
            title="Create folder"
            variant="ghost"
            className="h-9 w-9"
          >
            <FolderPlusIcon size={14} />
          </IconButton>
        )}
      </div>

      {/* Create folder input */}
      {showCreateFolder && !collapsed && (
        <div className="sidebar-section pb-3">
          <div className="flex gap-2">
            <input
              className="input flex-1 text-sm"
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
              <CheckIcon size={14} />
            </IconButton>
            <IconButton 
              size="sm" 
              onClick={() => {
                setShowCreateFolder(false);
                setNewFolderName('');
              }}
              title="Cancel"
            >
              <XIcon size={14} />
            </IconButton>
          </div>
        </div>
      )}

      {!collapsed && <div className="sidebar-section text-xs text-muted-foreground font-medium uppercase tracking-wider pb-2">Chats</div>}
      
      {/* Drop zone for root level */}
      <div 
        className={`scroll-area flex-1 sidebar-section`}
        onDragOver={handleDragOver}
        onDrop={async (e) => {
          e.preventDefault();
          const dragData = getCurrentDragData();
          if (dragData && dragData.type === 'chat') {
            await handleDrop(undefined, dragData.id, dragData.type);
          }
          setCurrentDragData(null);
        }}
      >
        {/* Root folders */}
        {rootFolders.map((folder) => (
          <FolderItem key={folder.id} folder={folder} />
        ))}

        {/* Root chats */}
        {rootChats.map((chat) => (
          <RootChatItem
            key={chat.id}
            chat={chat}
            collapsed={collapsed}
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
          />
        ))}
      </div>
    </div>
  );
}

// Component for root-level chats (outside folders)
interface RootChatItemProps {
  chat: Chat;
  collapsed: boolean;
  isSelected: boolean;
  isEditing: boolean;
  editTitle: string;
  onSelect: () => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onEditTitleChange: (title: string) => void;
}

function RootChatItem({ 
  chat, 
  collapsed, 
  isSelected, 
  isEditing, 
  editTitle, 
  onSelect, 
  onStartEdit, 
  onSaveEdit, 
  onCancelEdit, 
  onDelete, 
  onEditTitleChange 
}: RootChatItemProps) {
  return (
    <div className="pb-1">
      <div
        className={`flex items-center gap-2 px-4 py-2 cursor-pointer group chat-item ${
          isSelected ? 'selected' : ''
        }`}
        draggable
        onDragStart={() => {
          setCurrentDragData({ id: chat.id, type: 'chat' });
        }}
        onClick={!isEditing ? onSelect : undefined}
      >
        {/* Chat Icon */}
        <div className="w-4 h-4 flex items-center justify-center text-muted-foreground">
          <MessageIcon size={14} />
        </div>

        {/* Chat Title */}
        {isEditing ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              className="input flex-1 text-sm"
              value={editTitle}
              onChange={(e) => onEditTitleChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSaveEdit();
                if (e.key === 'Escape') onCancelEdit();
              }}
              onBlur={onSaveEdit}
              autoFocus
            />
          </div>
        ) : (
                  <div className="flex-1 text-sm truncate">
          {collapsed ? '' : chat.title}
        </div>
        )}

        {/* Action Buttons */}
        {!isEditing && !collapsed && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
            <IconButton
              size="sm"
              onClick={(e) => {
                e?.stopPropagation();
                onStartEdit();
              }}
              title="Rename chat"
            >
              <EditIcon size={12} />
            </IconButton>
            <IconButton
              size="sm"
              onClick={(e) => {
                e?.stopPropagation();
                if (confirm(`Delete chat "${chat.title}"?`)) {
                  onDelete();
                }
              }}
              title="Delete chat"
            >
              <TrashIcon size={12} />
            </IconButton>
          </div>
        )}
      </div>
    </div>
  );
}
