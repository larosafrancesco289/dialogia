'use client';

import type { PointerEvent as ReactPointerEvent } from 'react';
import { IconButton } from '@/components/ui/IconButton';
import {
  FolderIcon,
  FolderOpenIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  PencilSquareIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';

export type FolderRowViewProps = {
  folderId: string;
  name: string;
  depth: number;
  isExpanded: boolean;
  isEditing: boolean;
  editName: string;
  isDragOver: boolean;
  isMobile: boolean;
  onToggleExpanded: () => void;
  onEditNameChange: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onStartEdit: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onPointerDown: (event: ReactPointerEvent) => void;
  onPointerMove: (event: ReactPointerEvent) => void;
  onPointerUp: (event: ReactPointerEvent) => void;
  onPointerCancel: () => void;
};

export function FolderRowView({
  folderId,
  name,
  depth,
  isExpanded,
  isEditing,
  editName,
  isDragOver,
  isMobile,
  onToggleExpanded,
  onEditNameChange,
  onSaveEdit,
  onCancelEdit,
  onStartEdit,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: FolderRowViewProps) {
  const indentStep = 24;
  const paddingLeft = 16;
  const marginLeft = depth * indentStep;

  return (
    <div className="relative" style={{ paddingLeft: `${paddingLeft}px` }}>
      <div
        className={`flex items-center gap-2 px-4 py-3 sm:py-2 cursor-pointer group chat-item folder-row ${
          isDragOver ? 'is-drag-over' : ''
        }`}
        draggable
        data-folder-id={folderId}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onClick={() => {
          if (isEditing) return;
          if (!isMobile) onToggleExpanded();
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        style={{ marginLeft: `${marginLeft}px`, paddingLeft: `${paddingLeft}px` }}
      >
        <IconButton
          size="sm"
          onClick={(e) => {
            e?.stopPropagation();
            onToggleExpanded();
          }}
          className="w-6 h-6 shrink-0"
        >
          {isExpanded ? (
            <ChevronDownIcon className="h-4 w-4" />
          ) : (
            <ChevronRightIcon className="h-4 w-4" />
          )}
        </IconButton>

        <div className="w-6 h-6 flex items-center justify-center text-muted-foreground shrink-0">
          {isExpanded ? <FolderOpenIcon className="h-5 w-5" /> : <FolderIcon className="h-5 w-5" />}
        </div>

        {isEditing ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              className="input flex-1 text-base sm:text-sm"
              value={editName}
              onChange={(e) => onEditNameChange(e.target.value)}
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
        ) : (
          <div className="flex-1 text-sm truncate font-semibold">{name}</div>
        )}

        {!isEditing && (
          <div className="hidden sm:flex opacity-0 sm:group-hover:opacity-100 transition-opacity gap-1">
            <IconButton size="sm" onClick={onStartEdit} title="Rename folder">
              <PencilSquareIcon className="h-3 w-3" />
            </IconButton>
            <IconButton size="sm" onClick={onDelete} title="Delete folder">
              <TrashIcon className="h-3 w-3" />
            </IconButton>
          </div>
        )}
      </div>
    </div>
  );
}
