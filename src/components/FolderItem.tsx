'use client';
import { useState } from 'react';
import { useChatStore } from '@/lib/store';
import { useDragAndDrop, setCurrentDragData, getCurrentDragData } from '@/lib/dragDrop';
import IconButton from './IconButton';
import {
  FolderIcon,
  FolderOpenIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  MessageIcon,
  EditIcon,
  TrashIcon,
} from './icons/Icons';
import type { Folder, Chat } from '@/lib/types';

interface FolderItemProps {
  folder: Folder;
  depth?: number;
}

export default function FolderItem({ folder, depth = 0 }: FolderItemProps) {
  const {
    chats,
    folders,
    selectedChatId,
    selectChat,
    renameFolder,
    deleteFolder,
    toggleFolderExpanded,
  } = useChatStore();

  const { handleDragOver, handleDrop } = useDragAndDrop();

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(folder.name);
  const [isDragOver, setIsDragOver] = useState(false);

  // Get chats and subfolders for this folder
  const folderChats = chats.filter((chat) => chat.folderId === folder.id);
  const subFolders = folders.filter((f) => f.parentId === folder.id);

  const handleToggleExpanded = () => {
    toggleFolderExpanded(folder.id);
  };

  const handleRename = async () => {
    if (editName.trim() && editName !== folder.name) {
      await renameFolder(folder.id, editName.trim());
    }
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (confirm(`Delete folder "${folder.name}"? Chats will be moved to the root level.`)) {
      await deleteFolder(folder.id);
    }
  };

  const paddingLeft = depth * 16 + 16; // 16px per level + base padding

  return (
    <div>
      {/* Folder Header */}
      <div
        className={`flex items-center gap-2 px-4 py-2 cursor-pointer group folder-item ${
          isDragOver ? 'drag-over' : ''
        }`}
        style={{ paddingLeft: `${paddingLeft}px` }}
        draggable
        onDragStart={() => {
          setCurrentDragData({ id: folder.id, type: 'folder' });
        }}
        onDragOver={(e) => {
          handleDragOver(e);
          setIsDragOver(true);
        }}
        onDragLeave={() => {
          setIsDragOver(false);
        }}
        onDrop={async (e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragOver(false);
          const dragData = getCurrentDragData();
          if (dragData && dragData.id !== folder.id) {
            await handleDrop(folder.id, dragData.id, dragData.type);
          }
          setCurrentDragData(null);
        }}
      >
        {/* Expand/Collapse Icon */}
        <IconButton
          size="sm"
          onClick={(e) => {
            e?.stopPropagation();
            handleToggleExpanded();
          }}
          className="w-4 h-4 shrink-0"
        >
          {folder.isExpanded ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
        </IconButton>

        {/* Folder Icon */}
        <div className="w-4 h-4 flex items-center justify-center text-muted-foreground shrink-0">
          {folder.isExpanded ? <FolderOpenIcon size={14} /> : <FolderIcon size={14} />}
        </div>

        {/* Folder Name */}
        {isEditing ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              className="input flex-1 text-sm"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') {
                  setIsEditing(false);
                  setEditName(folder.name);
                }
              }}
              onBlur={handleRename}
              autoFocus
            />
          </div>
        ) : (
          <div
            className="flex-1 text-sm truncate font-medium text-muted-foreground"
            onClick={handleToggleExpanded}
          >
            {folder.name}
          </div>
        )}

        {/* Action Buttons */}
        {!isEditing && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
            <IconButton
              size="sm"
              onClick={(e) => {
                e?.stopPropagation();
                setIsEditing(true);
                setEditName(folder.name);
              }}
              title="Rename folder"
            >
              <EditIcon size={12} />
            </IconButton>
            <IconButton
              size="sm"
              onClick={(e) => {
                e?.stopPropagation();
                handleDelete();
              }}
              title="Delete folder"
            >
              <TrashIcon size={12} />
            </IconButton>
          </div>
        )}
      </div>

      {/* Folder Contents (when expanded) */}
      {folder.isExpanded && (
        <div>
          {/* Sub-folders */}
          {subFolders.map((subFolder) => (
            <FolderItem key={subFolder.id} folder={subFolder} depth={depth + 1} />
          ))}

          {/* Chats in this folder */}
          {folderChats.map((chat) => (
            <ChatItem
              key={chat.id}
              chat={chat}
              depth={depth + 1}
              isSelected={selectedChatId === chat.id}
              onSelect={() => selectChat(chat.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ChatItemProps {
  chat: Chat;
  depth: number;
  isSelected: boolean;
  onSelect: () => void;
}

function ChatItem({ chat, depth, isSelected, onSelect }: ChatItemProps) {
  const { renameChat, deleteChat } = useChatStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(chat.title);

  const handleRename = async () => {
    if (editTitle.trim() && editTitle !== chat.title) {
      await renameChat(chat.id, editTitle.trim());
    }
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (confirm(`Delete chat "${chat.title}"?`)) {
      await deleteChat(chat.id);
    }
  };

  const paddingLeft = (depth + 1) * 16 + 16; // Extra level for chat items

  return (
    <div
      className={`flex items-center gap-2 px-4 py-2 cursor-pointer group chat-item ${
        isSelected ? 'selected' : ''
      }`}
      style={{ paddingLeft: `${paddingLeft}px` }}
      draggable
      onDragStart={() => {
        setCurrentDragData({ id: chat.id, type: 'chat' });
      }}
      onClick={!isEditing ? onSelect : undefined}
    >
      {/* Chat Icon */}
      <div className="w-4 h-4 flex items-center justify-center text-muted-foreground shrink-0">
        <MessageIcon size={14} />
      </div>

      {/* Chat Title */}
      {isEditing ? (
        <div className="flex items-center gap-2 flex-1">
          <input
            className="input flex-1 text-sm"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename();
              if (e.key === 'Escape') {
                setIsEditing(false);
                setEditTitle(chat.title);
              }
            }}
            onBlur={handleRename}
            autoFocus
          />
        </div>
      ) : (
        <div className="flex-1 text-sm truncate">{chat.title}</div>
      )}

      {/* Action Buttons */}
      {!isEditing && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
          <IconButton
            size="sm"
            onClick={(e) => {
              e?.stopPropagation();
              setIsEditing(true);
              setEditTitle(chat.title);
            }}
            title="Rename chat"
          >
            <EditIcon size={12} />
          </IconButton>
          <IconButton
            size="sm"
            onClick={(e) => {
              e?.stopPropagation();
              handleDelete();
            }}
            title="Delete chat"
          >
            <TrashIcon size={12} />
          </IconButton>
        </div>
      )}
    </div>
  );
}
