'use client';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChatBubbleLeftRightIcon,
  PencilSquareIcon,
  TrashIcon,
  FolderOpenIcon,
} from '@heroicons/react/24/outline';
import type { Chat, Folder } from '@/lib/types';
import { IconButton } from '@/components/IconButton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { MoveChatSheet } from '@/components/MoveChatSheet';

export type ChatRowProps = {
  chat: Chat;
  collapsed: boolean;
  isMobile: boolean;
  isSelected: boolean;
  isEditing: boolean;
  editTitle: string;
  onSelect: () => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onEditTitleChange: (title: string) => void;
  folders: Folder[];
  moveChatToFolder: (chatId: string, folderId?: string) => Promise<void>;
  onDragStart: (chatId: string) => void;
  onDragEnd: () => void;
};

export function ChatRow({
  chat,
  collapsed,
  isMobile,
  isSelected,
  isEditing,
  editTitle,
  onSelect,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onEditTitleChange,
  folders,
  moveChatToFolder,
  onDragStart,
  onDragEnd,
}: ChatRowProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [showMoveSheet, setShowMoveSheet] = useState(false);
  // Long-press detection (mobile)
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
    const moved =
      Math.abs(e.clientX - startX.current) > slop || Math.abs(e.clientY - startY.current) > slop;
    if (!longFired.current && !moved) onSelect();
    clearLong();
  };
  const onPointerCancel = () => {
    clearLong();
  };

  return (
    <>
      <div className="pb-1" data-row-press>
        <div className="relative">
          <div
            className={`flex items-center gap-2 px-4 py-3 sm:py-2 cursor-pointer group chat-item ${
              isSelected ? 'selected' : ''
            }`}
            draggable={!isMobile}
            onDragStart={() => {
              if (isMobile) return;
              onDragStart(chat.id);
            }}
            onDragEnd={onDragEnd}
            onClick={!isEditing ? onSelect : undefined}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
          >
            {/* Chat Icon */}
            <div className="w-6 h-6 sm:w-4 sm:h-4 flex items-center justify-center text-muted-foreground">
              <ChatBubbleLeftRightIcon className="h-5 w-5 sm:h-3.5 sm:w-3.5" />
            </div>

            {/* Chat Title */}
            {isEditing ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  className="input flex-1 text-base sm:text-sm"
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
              <div className="flex-1 text-base sm:text-sm truncate">
                {collapsed ? '' : chat.title}
              </div>
            )}

            {/* Desktop action icons only (hide on mobile) */}
            {!isEditing && !collapsed && (
              <div className="hidden sm:flex opacity-0 sm:group-hover:opacity-100 transition-opacity gap-1">
                <IconButton
                  size="sm"
                  onClick={(e) => {
                    e?.stopPropagation();
                    onStartEdit();
                  }}
                  title="Rename chat"
                >
                  <PencilSquareIcon className="h-4 w-4" />
                </IconButton>
                <IconButton
                  size="sm"
                  onClick={(e) => {
                    e?.stopPropagation();
                    setShowMoveSheet(true);
                  }}
                  title="Move to folder"
                >
                  <FolderOpenIcon className="h-4 w-4" />
                </IconButton>
                <IconButton
                  size="sm"
                  onClick={(e) => {
                    e?.stopPropagation();
                    setShowConfirm(true);
                  }}
                  title="Delete chat"
                >
                  <TrashIcon className="h-4 w-4" />
                </IconButton>
              </div>
            )}
          </div>
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
              aria-label={`Actions for ${chat.title}`}
            >
              <div className="mobile-sheet-handle" aria-hidden="true" />
              <button
                type="button"
                className="mobile-menu-item"
                onClick={() => {
                  setShowActions(false);
                  onStartEdit();
                }}
                title="Rename chat"
              >
                <PencilSquareIcon className="h-4 w-4" />
                <span>Rename chat</span>
              </button>
              <button
                type="button"
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
                type="button"
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
        description={`Delete chat \"${chat.title}\"?`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onCancel={() => setShowConfirm(false)}
        onConfirm={() => {
          setShowConfirm(false);
          onDelete();
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
