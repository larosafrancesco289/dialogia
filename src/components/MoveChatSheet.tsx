'use client';

import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { Folder } from '@/lib/types';

export type MoveChatSheetProps = {
  open: boolean;
  chatTitle: string;
  currentFolderId?: string;
  folders: Folder[];
  onMove: (folderId?: string) => void | Promise<void>;
  onClose: () => void;
};

type FolderOption = {
  id?: string;
  label: string;
  depth: number;
};

function buildFolderOptions(folders: Folder[], parentId?: string, depth = 0): FolderOption[] {
  const sorted = folders
    .filter((folder) => folder.parentId === parentId)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  const result: FolderOption[] = [];
  for (const folder of sorted) {
    result.push({ id: folder.id, label: folder.name, depth });
    result.push(...buildFolderOptions(folders, folder.id, depth + 1));
  }
  return result;
}

export function MoveChatSheet({ open, chatTitle, currentFolderId, folders, onMove, onClose }: MoveChatSheetProps) {
  const options = useMemo(() => buildFolderOptions(folders), [folders]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="mobile-sheet-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Move ${chatTitle} to folder`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="mobile-sheet card mobile-sheet-compact" role="menu">
        <div className="mobile-sheet-handle" aria-hidden="true" />
        <div className="text-sm font-semibold px-1 pb-1">Move "{chatTitle}"</div>
        <button
          type="button"
          className={`mobile-menu-item ${currentFolderId ? '' : 'is-active'}`.trim()}
          onClick={() => onMove(undefined)}
        >
          <span>Unfiled</span>
        </button>
        {options.length === 0 ? (
          <div className="text-xs text-muted-foreground px-1 py-2">Create a folder to organize chats.</div>
        ) : (
          options.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`mobile-menu-item ${option.id === currentFolderId ? 'is-active' : ''}`.trim()}
              style={{ paddingLeft: `calc(${option.depth} * 1.25rem + var(--space-3))` }}
              onClick={() => onMove(option.id)}
            >
              <span>{option.label}</span>
            </button>
          ))
        )}
        <button type="button" className="btn btn-ghost w-full h-11" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>,
    document.body,
  );
}
