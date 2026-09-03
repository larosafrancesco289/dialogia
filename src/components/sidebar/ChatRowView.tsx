import type { PointerEvent } from 'react';
import { IconButton } from '@/components/ui/IconButton';
import {
  ChatBubbleLeftRightIcon,
  PencilSquareIcon,
  TrashIcon,
  FolderOpenIcon,
} from '@heroicons/react/24/outline';

export type ChatRowViewProps = {
  chatId: string;
  title: string;
  depth: number;
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
  onMove: () => void;
  onEditTitleChange: (value: string) => void;
  onDragStart: (chatId: string) => void;
  onDragEnd: () => void;
  onPointerDown: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerUp: (event: PointerEvent) => void;
  onPointerCancel: () => void;
};

export function ChatRowView({
  chatId,
  title,
  depth,
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
  onMove,
  onEditTitleChange,
  onDragStart,
  onDragEnd,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: ChatRowViewProps) {
  const indentStep = 24;
  const paddingLeft = 16;
  const marginLeft = depth * indentStep;
  const showTitle = !collapsed || isEditing;
  const allowActions = !collapsed && !isEditing;

  return (
    <div
      className={`flex items-center gap-2 px-4 py-2 cursor-pointer group chat-item ${
        isSelected ? 'selected' : ''
      }`}
      title={collapsed ? title : undefined}
      style={{ marginLeft: `${marginLeft}px`, paddingLeft: `${paddingLeft}px` }}
      draggable={!isMobile}
      onDragStart={() => {
        if (isMobile) return;
        onDragStart(chatId);
      }}
      onDragEnd={onDragEnd}
      onClick={!isEditing && !isMobile ? onSelect : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <div className="w-4 h-4 flex items-center justify-center text-muted-foreground shrink-0">
        <ChatBubbleLeftRightIcon className="h-3.5 w-3.5" />
      </div>

      {isEditing ? (
        <div className="flex items-center gap-2 flex-1">
          <input
            className="input flex-1 text-base sm:text-sm"
            value={editTitle}
            onChange={(e) => onEditTitleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveEdit();
              if (e.key === 'Escape') {
                onCancelEdit();
              }
            }}
            onBlur={onSaveEdit}
            autoFocus
          />
        </div>
      ) : showTitle ? (
        <div className="flex-1 text-sm truncate">{title}</div>
      ) : null}

      {allowActions && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
          <IconButton
            size="sm"
            onClick={(e) => {
              e?.stopPropagation();
              onStartEdit();
            }}
            title="Rename chat"
          >
            <PencilSquareIcon className="h-3 w-3" />
          </IconButton>
          <IconButton
            size="sm"
            onClick={(e) => {
              e?.stopPropagation();
              onMove();
            }}
            title="Move to folder"
          >
            <FolderOpenIcon className="h-3 w-3" />
          </IconButton>
          <IconButton
            size="sm"
            onClick={(e) => {
              e?.stopPropagation();
              onDelete();
            }}
            title="Delete chat"
          >
            <TrashIcon className="h-3 w-3" />
          </IconButton>
        </div>
      )}
    </div>
  );
}
