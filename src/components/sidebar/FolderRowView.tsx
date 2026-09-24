import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { IconButton } from '@/components/ui/IconButton';
import { ChevronRightIcon, PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import { InlineTitleEdit } from '@/components/sidebar/InlineTitleEdit';
import { ROW_INDENT } from '@/components/sidebar/ChatRowView';
import { createSingleClickDeferral } from '@/lib/ui/clickIntent';

export type FolderRowViewProps = {
  folderId: string;
  name: string;
  count: number;
  depth: number;
  isExpanded: boolean;
  isEditing: boolean;
  isDragOver: boolean;
  isMobile: boolean;
  onToggleExpanded: () => void;
  onCommitEdit: (name: string) => void | Promise<void>;
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

/**
 * A folder is a row like a chat: a chevron that turns as it opens, the name,
 * how many chats it holds, and the same actions on hover or focus.
 */
export function FolderRowView({
  folderId,
  name,
  count,
  depth,
  isExpanded,
  isEditing,
  isDragOver,
  isMobile,
  onToggleExpanded,
  onCommitEdit,
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
  // A double click renames; folding waits to be sure it was a single click,
  // so the folder does not open and shut again before the name field shows.
  const toggleRef = useRef(onToggleExpanded);
  toggleRef.current = onToggleExpanded;
  const [clicks] = useState(() => createSingleClickDeferral(() => toggleRef.current()));
  useEffect(() => clicks.cancel, [clicks]);

  return (
    <div
      className={`flex items-center gap-2 px-4 py-2 cursor-pointer group chat-item folder-row${
        isDragOver ? ' is-drag-over' : ''
      }${isEditing ? ' is-editing' : ''}`}
      style={depth ? { marginLeft: `${depth * ROW_INDENT}px` } : undefined}
      aria-expanded={isExpanded}
      // Folders do not nest or reorder, so a folder is not something to drag.
      draggable={false}
      // Reachable by keyboard: Enter or Space folds it, F2 renames it.
      tabIndex={isEditing ? -1 : 0}
      onKeyDown={(event) => {
        if (isEditing || event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onToggleExpanded();
        } else if (event.key === 'F2') {
          event.preventDefault();
          onStartEdit();
        }
      }}
      data-folder-id={folderId}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={(event) => {
        if (isEditing || isMobile) return;
        clicks.click(event.detail);
      }}
      onDoubleClick={
        !isMobile && !isEditing
          ? () => {
              clicks.cancel();
              onStartEdit();
            }
          : undefined
      }
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <ChevronRightIcon
        className={`folder-row__chevron${isExpanded ? ' is-open' : ''}`}
        aria-hidden="true"
      />

      {isEditing ? (
        <InlineTitleEdit
          value={name}
          ariaLabel="Folder name"
          onCommit={onCommitEdit}
          onCancel={onCancelEdit}
        />
      ) : (
        <>
          <span className="flex-1 min-w-0 text-sm truncate folder-row__name">{name}</span>
          <span className="folder-row__count" aria-label={`${count} chats`}>
            {count}
          </span>
        </>
      )}

      {!isEditing && (
        <div className="chat-item__actions">
          <IconButton
            size="sm"
            onClick={(e) => {
              e?.stopPropagation();
              onStartEdit();
            }}
            title="Rename folder"
          >
            <PencilSquareIcon />
          </IconButton>
          <IconButton
            size="sm"
            onClick={(e) => {
              e?.stopPropagation();
              onDelete();
            }}
            title="Delete folder"
          >
            <TrashIcon />
          </IconButton>
        </div>
      )}
    </div>
  );
}
