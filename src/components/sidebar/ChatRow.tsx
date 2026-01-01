'use client';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { IconButton } from '@/components/IconButton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { MoveChatSheet } from '@/components/MoveChatSheet';
import {
  ChatBubbleLeftRightIcon,
  PencilSquareIcon,
  TrashIcon,
  FolderOpenIcon,
} from '@heroicons/react/24/outline';
import type { Chat, Folder } from '@/lib/types';

export interface ChatRowProps {
  chat: Chat;
  depth?: number;
  collapsed?: boolean;
  isMobile?: boolean;
  isSelected: boolean;
  isEditing?: boolean;
  editTitle?: string;
  onSelect: () => void;
  onStartEdit?: () => void;
  onSaveEdit?: () => Promise<void> | void;
  onCancelEdit?: () => void;
  onDelete?: () => Promise<void> | void;
  onEditTitleChange?: (value: string) => void;
  folders?: Folder[];
  moveChatToFolder?: (chatId: string, folderId?: string) => Promise<void> | void;
  onDragStart: (chatId: string) => void;
  onDragEnd: () => void;
}

export function ChatRow({
  chat,
  depth = 0,
  collapsed = false,
  isMobile: isMobileProp,
  isSelected,
  isEditing,
  editTitle,
  onSelect,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onEditTitleChange,
  folders: foldersProp,
  moveChatToFolder: moveChatToFolderProp,
  onDragStart,
  onDragEnd,
}: ChatRowProps) {
  const { renameChat, deleteChat, moveChatToFolder, folders } = useChatStore(
    (state) => ({
      renameChat: state.renameChat,
      deleteChat: state.deleteChat,
      moveChatToFolder: state.moveChatToFolder,
      folders: state.folders,
    }),
    shallow,
  );
  const [localEditing, setLocalEditing] = useState(false);
  const [localEditTitle, setLocalEditTitle] = useState(chat.title);
  const [showConfirm, setShowConfirm] = useState(false);
  const detectedMobile = useIsMobile();
  const isMobile = isMobileProp ?? detectedMobile;
  const [showActions, setShowActions] = useState(false);
  const [showMoveSheet, setShowMoveSheet] = useState(false);
  const longStartX = useRef(0);
  const longStartY = useRef(0);
  const longTid = useRef<number | null>(null);
  const longFired = useRef(false);

  const controlledEditing = typeof isEditing === 'boolean';
  const editing = controlledEditing ? isEditing : localEditing;
  const titleValue = editTitle ?? localEditTitle;
  const setTitle = onEditTitleChange ?? setLocalEditTitle;
  const resolvedFolders = foldersProp ?? folders;
  const resolvedMoveChat = moveChatToFolderProp ?? moveChatToFolder;

  const handleDelete = async () => {
    if (onDelete) {
      await onDelete();
      return;
    }
    await deleteChat(chat.id);
  };

  useEffect(() => {
    if (!editing && !controlledEditing) {
      setLocalEditTitle(chat.title);
    }
  }, [chat.title, editing, controlledEditing]);

  const startEditing = () => {
    if (onStartEdit) {
      onStartEdit();
      return;
    }
    setLocalEditTitle(chat.title);
    setLocalEditing(true);
  };

  const cancelEditing = () => {
    if (onCancelEdit) {
      onCancelEdit();
      return;
    }
    setLocalEditing(false);
    setLocalEditTitle(chat.title);
  };

  const saveEditing = async () => {
    if (onSaveEdit) {
      await onSaveEdit();
      return;
    }
    const nextTitle = titleValue.trim();
    if (nextTitle && nextTitle !== chat.title) {
      await renameChat(chat.id, nextTitle);
    }
    setLocalEditing(false);
  };

  const clearLong = () => {
    if (longTid.current) window.clearTimeout(longTid.current);
    longTid.current = null;
  };

  const onPointerDown = (e: PointerEvent) => {
    if (!isMobile || editing) return;
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

  const onPointerMove = (e: PointerEvent) => {
    if (!isMobile || editing || !longTid.current) return;
    const dx = Math.abs(e.clientX - longStartX.current);
    const dy = Math.abs(e.clientY - longStartY.current);
    if (dx > 10 || dy > 10) clearLong();
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!isMobile || editing) return;
    const moved =
      Math.abs(e.clientX - longStartX.current) > 10 ||
      Math.abs(e.clientY - longStartY.current) > 10;
    if (!longFired.current && !moved) onSelect();
    clearLong();
  };

  const onPointerCancel = () => {
    clearLong();
  };

  const indentStep = 24;
  const paddingLeft = 16;
  const marginLeft = depth * indentStep;
  const showTitle = !collapsed || editing;
  const allowActions = !collapsed && !editing;

  return (
    <>
      <div
        className={`flex items-center gap-2 px-4 py-2 cursor-pointer group chat-item ${
          isSelected ? 'selected' : ''
        }`}
        title={collapsed ? chat.title : undefined}
        style={{ marginLeft: `${marginLeft}px`, paddingLeft: `${paddingLeft}px` }}
        draggable={!isMobile}
        onDragStart={() => {
          if (isMobile) return;
          onDragStart(chat.id);
        }}
        onDragEnd={onDragEnd}
        onClick={!editing ? onSelect : undefined}
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
        {editing ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              className="input flex-1 text-base sm:text-sm"
              value={titleValue}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveEditing();
                if (e.key === 'Escape') {
                  cancelEditing();
                }
              }}
              onBlur={saveEditing}
              autoFocus
            />
          </div>
        ) : showTitle ? (
          <div className="flex-1 text-sm truncate">{chat.title}</div>
        ) : null}

        {/* Action Buttons */}
        {allowActions && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
            <IconButton
              size="sm"
              onClick={(e) => {
                e?.stopPropagation();
                startEditing();
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
              aria-label={`Actions for ${chat.title}`}
            >
              <div className="mobile-sheet-handle" aria-hidden="true" />
              <button
                className="mobile-menu-item"
                onClick={() => {
                  setShowActions(false);
                  startEditing();
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
          void handleDelete();
        }}
      />
      {resolvedFolders && (
        <MoveChatSheet
          open={showMoveSheet}
          chatTitle={chat.title}
          currentFolderId={chat.folderId}
          folders={resolvedFolders}
          onClose={() => setShowMoveSheet(false)}
          onMove={async (target) => {
            if (target === chat.folderId) {
              setShowMoveSheet(false);
              return;
            }
            await resolvedMoveChat(chat.id, target);
            setShowMoveSheet(false);
          }}
        />
      )}
    </>
  );
}
