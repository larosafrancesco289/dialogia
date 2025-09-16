'use client';
import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '@/lib/store';
import { useDragAndDrop, setCurrentDragData, getCurrentDragData } from '@/lib/dragDrop';
import IconButton from './IconButton';
import ConfirmDialog from './ConfirmDialog';
import {
  FolderIcon,
  FolderOpenIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ChatBubbleLeftRightIcon,
  PencilSquareIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
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
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const update = () => setIsMobile(typeof window !== 'undefined' && window.innerWidth < 640);
    update();
    window.addEventListener('resize', update, { passive: true } as any);
    return () => window.removeEventListener('resize', update as any);
  }, []);

  // Long-press for folder actions (mobile only)
  const [showActions, setShowActions] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const longTid = useRef<number | null>(null);
  const longFired = useRef(false);
  const slop = 8;
  const clearLong = () => {
    if (longTid.current) window.clearTimeout(longTid.current);
    longTid.current = null;
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (!isMobile || isEditing) return;
    if (e.pointerType === 'mouse') return;
    startX.current = e.clientX;
    startY.current = e.clientY;
    longFired.current = false;
    clearLong();
    longTid.current = window.setTimeout(() => {
      longFired.current = true;
      setShowActions(true);
    }, 500);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!isMobile || isEditing) return;
    const dxNow = e.clientX - startX.current;
    const dyNow = e.clientY - startY.current;
    if (Math.abs(dxNow) > slop || Math.abs(dyNow) > slop) {
      clearLong();
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!isMobile || isEditing) return;
    const moved = Math.abs(e.clientX - startX.current) > slop || Math.abs(e.clientY - startY.current) > slop;
    if (!longFired.current && !moved) handleToggleExpanded();
    clearLong();
  };
  const onPointerCancel = () => {
    clearLong();
  };

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
    <div data-row-press>
      {/* Folder Header */}
      <div className="relative" style={{ paddingLeft: `${paddingLeft}px` }}>
        <div
          className={`flex items-center gap-2 px-4 py-2 cursor-pointer group folder-item ${
            isDragOver ? 'drag-over' : ''
          }`}
          draggable
          onDragStart={() => {
            setCurrentDragData({ id: folder.id, type: 'folder' });
          }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
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
          {folder.isExpanded ? <ChevronDownIcon className="h-3 w-3" /> : <ChevronRightIcon className="h-3 w-3" />}
        </IconButton>

        {/* Folder Icon */}
        <div className="w-4 h-4 flex items-center justify-center text-muted-foreground shrink-0">
          {folder.isExpanded ? <FolderOpenIcon className="h-3.5 w-3.5" /> : <FolderIcon className="h-3.5 w-3.5" />}
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

        {/* Desktop-only action buttons */}
        {!isEditing && (
          <div className="hidden sm:flex opacity-0 sm:group-hover:opacity-100 transition-opacity gap-1">
            <IconButton
              size="sm"
              onClick={(e) => {
                e?.stopPropagation();
                setIsEditing(true);
                setEditName(folder.name);
              }}
              title="Rename folder"
            >
              <PencilSquareIcon className="h-3 w-3" />
            </IconButton>
            <IconButton
              size="sm"
              onClick={(e) => {
                e?.stopPropagation();
                handleDelete();
              }}
              title="Delete folder"
            >
              <TrashIcon className="h-3 w-3" />
            </IconButton>
          </div>
        )}
        </div>
      </div>

      {isMobile && showActions && (
        <>
          <button
            className="fixed inset-0 z-[95] settings-overlay"
            aria-label="Close actions"
            onClick={() => setShowActions(false)}
          />
          <div className="fixed left-0 right-0 bottom-0 z-[100] p-2">
            <div className="card p-2 rounded-2xl overflow-hidden">
              <button
                className="w-full h-11 btn btn-outline mb-2"
                onClick={() => {
                  setShowActions(false);
                  setIsEditing(true);
                  setEditName(folder.name);
                }}
                title="Rename folder"
              >
                Rename
              </button>
              <button
                className="w-full h-11 btn btn-destructive"
                onClick={() => {
                  setShowActions(false);
                  handleDelete();
                }}
                title="Delete folder"
              >
                Delete
              </button>
            </div>
          </div>
        </>
      )}

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
  const [showConfirm, setShowConfirm] = useState(false);

  const handleRename = async () => {
    if (editTitle.trim() && editTitle !== chat.title) {
      await renameChat(chat.id, editTitle.trim());
    }
    setIsEditing(false);
  };

  const handleDelete = async () => {
    await deleteChat(chat.id);
  };

  const paddingLeft = (depth + 1) * 16 + 16; // Extra level for chat items

  return (
    <>
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
          <ChatBubbleLeftRightIcon className="h-3.5 w-3.5" />
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
              <PencilSquareIcon className="h-3 w-3" />
            </IconButton>
            <IconButton
              size="sm"
              onClick={(e) => {
                e?.stopPropagation();
                setShowConfirm(true);
              }}
              title="Delete chat"
            >
              <TrashIcon className="h-3 w-3" />
            </IconButton>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={showConfirm}
        title="Delete chat?"
        description={`Delete chat "${chat.title}"?`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onCancel={() => setShowConfirm(false)}
        onConfirm={() => {
          setShowConfirm(false);
          handleDelete();
        }}
      />
    </>
  );
}
