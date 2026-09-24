import { useMemo, useState } from 'react';
import { FolderPlusIcon } from '@heroicons/react/24/outline';
import type { Folder } from '@/lib/types';
import { BottomSheet, SheetItem } from '@/components/ui/BottomSheet';
import { InlineTitleEdit } from '@/components/sidebar/InlineTitleEdit';

export type MoveChatSheetProps = {
  open: boolean;
  chatTitle: string;
  currentFolderId?: string;
  folders: Folder[];
  onMove: (folderId?: string) => void | Promise<void>;
  /** Names a new folder and files the chat there, as the desktop menu does. */
  onCreateAndMove: (name: string) => void | Promise<void>;
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
  onCreateAndMove,
  onClose,
}: MoveChatSheetProps) {
  const options = useMemo(() => buildFolderOptions(folders), [folders]);
  const [naming, setNaming] = useState(false);

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
      {options.map((option) => (
        <SheetItem
          key={option.id}
          selected={option.id === currentFolderId}
          indent={option.depth}
          onClick={() => onMove(option.id)}
        >
          {option.label}
        </SheetItem>
      ))}
      {naming ? (
        <div className="sheet-item">
          <InlineTitleEdit
            value=""
            placeholder="Folder name"
            ariaLabel="New folder name"
            onCommit={(name) => onCreateAndMove(name)}
            onCancel={() => setNaming(false)}
          />
        </div>
      ) : (
        <SheetItem icon={<FolderPlusIcon className="h-5 w-5" />} onClick={() => setNaming(true)}>
          New folder…
        </SheetItem>
      )}
    </BottomSheet>
  );
}
