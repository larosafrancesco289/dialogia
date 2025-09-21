'use client';
import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import { useDragAndDrop, setCurrentDragData, getCurrentDragData } from '@/lib/dragDrop';
import IconButton from './IconButton';
import ConfirmDialog from './ConfirmDialog';
import { MoveChatSheet } from '@/components/MoveChatSheet';
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const suppressTap = useRef(false);
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
  const onPointerDown = (e: ReactPointerEvent) => {
    if (!isMobile || isEditing) return;
    if (e.pointerType === 'mouse') return;
    startX.current = e.clientX;
    startY.current = e.clientY;
    longFired.current = false;
    suppressTap.current = false;
    clearLong();
    longTid.current = window.setTimeout(() => {
      longFired.current = true;
      suppressTap.current = true;
      setShowActions(true);
    }, 500);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!isMobile || isEditing) return;
    const dxNow = e.clientX - startX.current;
    const dyNow = e.clientY - startY.current;
    if (Math.abs(dxNow) > slop || Math.abs(dyNow) > slop) {
      suppressTap.current = true;
      clearLong();
    }
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    if (!isMobile || isEditing) return;
    const moved = Math.abs(e.clientX - startX.current) > slop || Math.abs(e.clientY - startY.current) > slop;
    if (longFired.current || moved) suppressTap.current = true;
    clearLong();
  };
  const onPointerCancel = () => {
    suppressTap.current = true;
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
    await deleteFolder(folder.id);
  };

  const paddingLeft = depth * 16 + 16; // 16px per level + base padding

  return (
    <div data-row-press>
      {/* Folder Header */}
      <div className="relative" style={{ paddingLeft: `${paddingLeft}px` }}>
        <div
          className={`flex items-center gap-2 px-4 py-3 sm:py-2 cursor-pointer group chat-item folder-row ${
            isDragOver ? 'is-drag-over' : ''
          }`}
          draggable
          onDragStart={() => {
            setCurrentDragData({ id: folder.id, type: 'folder' });
          }}
        onClick={(e) => {
          if (isEditing) return;
          if (isMobile && suppressTap.current) {
            suppressTap.current = false;
            return;
          }
          suppressTap.current = false;
          handleToggleExpanded();
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
          className="w-6 h-6 shrink-0"
        >
          {folder.isExpanded ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
        </IconButton>

        {/* Folder Icon */}
        <div className="w-6 h-6 flex items-center justify-center text-muted-foreground shrink-0">
          {folder.isExpanded ? <FolderOpenIcon className="h-5 w-5" /> : <FolderIcon className="h-5 w-5" />}
        </div>

        {/* Folder Name */}
        {isEditing ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              className="input flex-1 text-base sm:text-sm"
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
          <div className="flex-1 text-sm truncate font-semibold">
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
                setShowDeleteConfirm(true);
              }}
              title="Delete folder"
            >
              <TrashIcon className="h-3 w-3" />
            </IconButton>
          </div>
        )}
        </div>
      </div>

      {isMobile && showActions && typeof document !== 'undefined' &&
        createPortal(
          <div
            className="mobile-sheet-overlay"
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget) setShowActions(false);
            }}
          >
            <div className="mobile-sheet card mobile-sheet-compact" role="menu" aria-label={`Folder actions for ${folder.name}`}>
              <div className="mobile-sheet-handle" aria-hidden="true" />
              <button
                className="mobile-menu-item"
                onClick={() => {
                  setShowActions(false);
                  setIsEditing(true);
                  setEditName(folder.name);
                }}
                title="Rename folder"
              >
                <PencilSquareIcon className="h-4 w-4" />
                <span>Rename folder</span>
              </button>
              <button
                className="mobile-menu-item is-danger"
                onClick={() => {
                  setShowActions(false);
                  setShowDeleteConfirm(true);
                }}
                title="Delete folder"
              >
                <TrashIcon className="h-4 w-4" />
                <span>Delete folder</span>
              </button>
            </div>
          </div>,
          document.body,
        )}

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete folder?"
        description={`Chats inside "${folder.name}" will move to the root.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={async () => {
          setShowDeleteConfirm(false);
          await handleDelete();
        }}
      />

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
  const { renameChat, deleteChat, moveChatToFolder, folders } = useChatStore(
    (state) => ({
      renameChat: state.renameChat,
      deleteChat: state.deleteChat,
      moveChatToFolder: state.moveChatToFolder,
      folders: state.folders,
    }),
    shallow,
  );
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(chat.title);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [showMoveSheet, setShowMoveSheet] = useState(false);
  const longStartX = useRef(0);
  const longStartY = useRef(0);
  const longTid = useRef<number | null>(null);
  const longFired = useRef(false);

  useEffect(() => {
    const update = () => setIsMobile(typeof window !== 'undefined' && window.innerWidth < 640);
    update();
    window.addEventListener('resize', update, { passive: true } as any);
    return () => window.removeEventListener('resize', update as any);
  }, []);

  const handleRename = async () => {
    if (editTitle.trim() && editTitle !== chat.title) {
      await renameChat(chat.id, editTitle.trim());
    }
    setIsEditing(false);
  };

  const handleDelete = async () => {
    await deleteChat(chat.id);
  };

  const clearLong = () => {
    if (longTid.current) window.clearTimeout(longTid.current);
    longTid.current = null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!isMobile || isEditing) return;
    if (e.pointerType === 'mouse') return;
    longStartX.current = e.clientX;
    longStartY.current = e.clientY;
    longFired.current = false;
    clearLong();
    longTid.current = window.setTimeout(() => {
      longFired.current = true;
      setShowActions(true);
    }, 480);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isMobile || isEditing || !longTid.current) return;
    const dx = Math.abs(e.clientX - longStartX.current);
    const dy = Math.abs(e.clientY - longStartY.current);
    if (dx > 10 || dy > 10) clearLong();
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!isMobile || isEditing) return;
    const moved =
      Math.abs(e.clientX - longStartX.current) > 10 || Math.abs(e.clientY - longStartY.current) > 10;
    if (!longFired.current && !moved) onSelect();
    clearLong();
  };

  const onPointerCancel = () => {
    clearLong();
  };

  const paddingLeft = (depth + 1) * 16 + 16; // Extra level for chat items

  return (
    <>
      <div
        className={`flex items-center gap-2 px-4 py-2 cursor-pointer group chat-item ${
          isSelected ? 'selected' : ''
        }`}
        style={{ paddingLeft: `${paddingLeft}px` }}
        draggable={!isMobile}
        onDragStart={() => {
          if (isMobile) return;
          setCurrentDragData({ id: chat.id, type: 'chat' });
        }}
        onClick={!isEditing ? onSelect : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {/* Chat Icon */}
        <div className="w-4 h-4 flex items-center justify-center text-muted-foreground shrink-0">
          <ChatBubbleLeftRightIcon className="h-3.5 w-3.5" />
        </div>

        {/* Chat Title */}
        {isEditing ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              className="input flex-1 text-base sm:text-sm"
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
                setShowMoveSheet(true);
              }}
              title="Move to folder"
            >
              <FolderOpenIcon className="h-3 w-3" />
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
      {isMobile && showActions && typeof document !== 'undefined' &&
        createPortal(
          <div
            className="mobile-sheet-overlay"
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget) setShowActions(false);
            }}
          >
            <div className="mobile-sheet card mobile-sheet-compact" role="menu" aria-label={`Actions for ${chat.title}`}>
              <div className="mobile-sheet-handle" aria-hidden="true" />
              <button
                className="mobile-menu-item"
                onClick={() => {
                  setShowActions(false);
                  setIsEditing(true);
                  setEditTitle(chat.title);
                }}
                title="Rename chat"
              >
                <PencilSquareIcon className="h-4 w-4" />
                <span>Rename chat</span>
              </button>
              <button
                className="mobile-menu-item"
                onClick={() => {
                  setShowActions(false);
                  setShowMoveSheet(true);
                }}
                title="Move chat to folder"
              >
                <FolderOpenIcon className="h-4 w-4" />
                <span>Move to folder</span>
              </button>
              <button
                className="mobile-menu-item is-danger"
                onClick={() => {
                  setShowActions(false);
                  setShowConfirm(true);
                }}
                title="Delete chat"
              >
                <TrashIcon className="h-4 w-4" />
                <span>Delete chat</span>
              </button>
            </div>
          </div>,
          document.body,
        )}
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
      <MoveChatSheet
        open={showMoveSheet}
        chatTitle={chat.title}
        currentFolderId={chat.folderId}
        folders={folders}
        onClose={() => setShowMoveSheet(false)}
        onMove={async (target) => {
          if (target === chat.folderId) {
            setShowMoveSheet(false);
            return;
          }
          await moveChatToFolder(chat.id, target);
          setShowMoveSheet(false);
        }}
      />
    </>
  );
}
