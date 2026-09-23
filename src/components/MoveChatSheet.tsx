import { useMemo } from 'react';
import type { Folder } from '@/lib/types';
import { BottomSheet, SheetItem } from '@/components/ui/BottomSheet';

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

export function buildFolderOptions(
  folders: Folder[],
  parentId?: string,
  depth = 0,
): FolderOption[] {
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

export function MoveChatSheet({
  open,
  chatTitle,
  currentFolderId,
  folders,
  onMove,
  onClose,
}: MoveChatSheetProps) {
  const options = useMemo(() => buildFolderOptions(folders), [folders]);

  return (
    <BottomSheet
      open={open}
      label={`Move ${chatTitle} to folder`}
      title={`Move “${chatTitle}”`}
      onClose={onClose}
    >
      <SheetItem selected={!currentFolderId} onClick={() => onMove(undefined)}>
        No folder
      </SheetItem>
      {options.length === 0 ? (
        <p className="sheet-hint">Create a folder to organize chats.</p>
      ) : (
        options.map((option) => (
          <SheetItem
            key={option.id}
            selected={option.id === currentFolderId}
            indent={option.depth}
            onClick={() => onMove(option.id)}
          >
            {option.label}
          </SheetItem>
        ))
      )}
    </BottomSheet>
  );
}
