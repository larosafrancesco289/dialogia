'use client';
import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import { useDragAndDrop } from '@/lib/dragDrop';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { getFolderChildren } from '@/lib/ui/sidebar/folderTree';
import { IconButton } from '@/components/IconButton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ChatRow } from '@/components/sidebar/ChatRow';
import {
  FolderIcon,
  FolderOpenIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  PencilSquareIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import type { Folder } from '@/lib/types';

interface FolderRowProps {
  folder: Folder;
  depth?: number;
}

export function FolderRow({ folder, depth = 0 }: FolderRowProps) {
  const {
    chats,
    folders,
    selectedChatId,
    selectChat,
    renameFolder,
    deleteFolder,
    toggleFolderExpanded,
  } = useChatStore(
    (s) => ({
      chats: s.chats,
      folders: s.folders,
      selectedChatId: s.selectedChatId,
      selectChat: s.selectChat,
      renameFolder: s.renameFolder,
      deleteFolder: s.deleteFolder,
      toggleFolderExpanded: s.toggleFolderExpanded,
    }),
    shallow,
  );

  const { handleDragOver, handleDrop, handleDragStart, handleDragEnd, getDragData } =
    useDragAndDrop();

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(folder.name);
  const [isDragOver, setIsDragOver] = useState(false);
  const isMobile = useIsMobile();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const suppressTap = useRef(false);

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
    const moved =
      Math.abs(e.clientX - startX.current) > slop || Math.abs(e.clientY - startY.current) > slop;
    if (longFired.current || moved) suppressTap.current = true;
    clearLong();
  };
  const onPointerCancel = () => {
    suppressTap.current = true;
    clearLong();
  };

  const { chats: folderChats, folders: subFolders } = getFolderChildren(folders, chats, folder.id);

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

  const indentStep = 24;
  const paddingLeft = 16;
  const marginLeft = depth * indentStep;

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
            handleDragStart(folder.id, 'folder');
          }}
          onDragEnd={handleDragEnd}
          onClick={() => {
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
            const dragData = getDragData();
            if (dragData && dragData.id !== folder.id) {
              await handleDrop(folder.id);
            }
          }}
          style={{ marginLeft: `${marginLeft}px`, paddingLeft: `${paddingLeft}px` }}
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
            {folder.isExpanded ? (
              <ChevronDownIcon className="h-4 w-4" />
            ) : (
              <ChevronRightIcon className="h-4 w-4" />
            )}
          </IconButton>

          {/* Folder Icon */}
          <div className="w-6 h-6 flex items-center justify-center text-muted-foreground shrink-0">
            {folder.isExpanded ? (
              <FolderOpenIcon className="h-5 w-5" />
            ) : (
              <FolderIcon className="h-5 w-5" />
            )}
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
            <div className="flex-1 text-sm truncate font-semibold">{folder.name}</div>
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

      {isMobile &&
        showActions &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="mobile-sheet-overlay"
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget) setShowActions(false);
            }}
          >
            <div
              className="mobile-sheet card mobile-sheet-compact"
              role="menu"
              aria-label={`Folder actions for ${folder.name}`}
            >
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
            <FolderRow key={subFolder.id} folder={subFolder} depth={depth + 1} />
          ))}

          {/* Chats in this folder */}
          {folderChats.map((chat) => (
            <ChatRow
              key={chat.id}
              chat={chat}
              depth={depth + 1}
              isSelected={selectedChatId === chat.id}
              onSelect={() => selectChat(chat.id)}
              onDragStart={(id) => handleDragStart(id, 'chat')}
              onDragEnd={handleDragEnd}
            />
          ))}
        </div>
      )}
    </div>
  );
}
