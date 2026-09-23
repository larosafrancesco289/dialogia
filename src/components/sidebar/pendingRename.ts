/**
 * A folder made by dropping one chat on another opens for naming. The drop
 * may land before or after the folder's row mounts, so a request is both
 * kept (for a row that mounts later) and announced (to a row already there).
 */
let pendingFolderId: string | null = null;
const listeners = new Set<(folderId: string) => void>();

export function requestFolderRename(folderId: string) {
  pendingFolderId = folderId;
  listeners.forEach((listener) => listener(folderId));
}

export function takeFolderRename(folderId: string): boolean {
  if (pendingFolderId !== folderId) return false;
  pendingFolderId = null;
  return true;
}

export function onFolderRenameRequest(listener: (folderId: string) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
