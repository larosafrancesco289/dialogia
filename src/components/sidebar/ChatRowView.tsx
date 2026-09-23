import type { PointerEvent } from 'react';
import { IconButton } from '@/components/ui/IconButton';
import { PencilSquareIcon, TrashIcon, FolderArrowDownIcon } from '@heroicons/react/24/outline';
import { InlineTitleEdit } from '@/components/sidebar/InlineTitleEdit';

export type ChatRowViewProps = {
  chatId: string;
  title: string;
  depth: number;
  collapsed: boolean;
  isMobile: boolean;
  isSelected: boolean;
  isEditing: boolean;
  onSelect: () => void;
  onStartEdit: () => void;
  onCommitEdit: (title: string) => void | Promise<void>;
  onCancelEdit: () => void;
  onDelete: () => void;
  onMove: (anchor: DOMRect) => void;
  onDragStart: (chatId: string) => void;
  onDragEnd: () => void;
  isDragOver?: boolean;
  onDragOver?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave?: () => void;
  onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
  onPointerDown: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerUp: (event: PointerEvent) => void;
  onPointerCancel: () => void;
};

/** Rows inside a folder start where the folder's name starts. */
export const ROW_INDENT = 24;

export function ChatRowView({
  chatId,
  title,
  depth,
  collapsed,
  isMobile,
  isSelected,
  isEditing,
  onSelect,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onDelete,
  onMove,
  onDragStart,
  onDragEnd,
  isDragOver = false,
  onDragOver,
  onDragLeave,
  onDrop,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: ChatRowViewProps) {
  const showTitle = !collapsed || isEditing;
  const allowActions = !collapsed && !isEditing;

  return (
    <div
      className={`flex items-center gap-2 px-4 py-2 cursor-pointer group chat-item ${
        isSelected ? 'selected' : ''
      }${isEditing ? ' is-editing' : ''}${isDragOver ? ' is-drag-over' : ''}`}
      title={collapsed ? title : undefined}
      style={depth ? { marginLeft: `${depth * ROW_INDENT}px` } : undefined}
      draggable={!isMobile && !isEditing}
      onDragStart={() => {
        if (isMobile) return;
        onDragStart(chatId);
      }}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={!isEditing && !isMobile ? onSelect : undefined}
      onDoubleClick={!isMobile && !isEditing ? onStartEdit : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {isEditing ? (
        <InlineTitleEdit
          value={title}
          ariaLabel="Chat name"
          onCommit={onCommitEdit}
          onCancel={onCancelEdit}
        />
      ) : showTitle ? (
        <div className="flex-1 text-sm truncate">{title}</div>
      ) : null}

      {allowActions && (
        <div className="chat-item__actions">
          <IconButton
            size="sm"
            onClick={(e) => {
              e?.stopPropagation();
              onStartEdit();
            }}
            title="Rename"
          >
            <PencilSquareIcon />
          </IconButton>
          <IconButton
            size="sm"
            onClick={(e) => {
              e?.stopPropagation();
              const target = e?.currentTarget as HTMLElement | undefined;
              if (target) onMove(target.getBoundingClientRect());
            }}
            title="Move to folder"
          >
            <FolderArrowDownIcon />
          </IconButton>
          <IconButton
            size="sm"
            onClick={(e) => {
              e?.stopPropagation();
              onDelete();
            }}
            title="Delete"
          >
            <TrashIcon />
          </IconButton>
        </div>
      )}
    </div>
  );
}
