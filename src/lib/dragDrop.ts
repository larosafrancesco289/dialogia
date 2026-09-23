import { useCallback } from 'react';
import type { DragEvent as ReactDragEvent } from 'react';
import { useChatStore } from '@/lib/store';

export interface DragData {
  id: string;
  type: 'folder' | 'chat';
}

let sharedDragData: DragData | null = null;

const setSharedDragData = (data: DragData | null) => {
  sharedDragData = data;
};

const getSharedDragData = () => sharedDragData;

export function useDragAndDrop() {
  const moveChatToFolder = useChatStore((s) => s.moveChatToFolder);
  const createFolder = useChatStore((s) => s.createFolder);

  const handleDragStart = useCallback((id: string, type: DragData['type']) => {
    setSharedDragData({ id, type });
  }, []);

  const handleDragEnd = useCallback(() => {
    setSharedDragData(null);
  }, []);

  const handleDragOver = useCallback((event: ReactDragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    async (targetFolderId?: string) => {
      const data = getSharedDragData();
      if (!data) return;
      if (data.type === 'chat') {
        await moveChatToFolder(data.id, targetFolderId);
      }
      setSharedDragData(null);
    },
    [moveChatToFolder],
  );

  /**
   * A chat dropped on another chat: beside it if that one is in a folder,
   * otherwise into a new folder holding both. Resolves to the new folder's
   * id, so the caller can open it for naming.
   */
  const dropChatOnChat = useCallback(
    async (target: { id: string; folderId?: string }): Promise<string | undefined> => {
      const data = getSharedDragData();
      setSharedDragData(null);
      if (!data || data.type !== 'chat' || data.id === target.id) return undefined;
      if (target.folderId) {
        await moveChatToFolder(data.id, target.folderId);
        return undefined;
      }
      const folder = await createFolder('New folder');
      await moveChatToFolder(target.id, folder.id);
      await moveChatToFolder(data.id, folder.id);
      return folder.id;
    },
    [createFolder, moveChatToFolder],
  );

  const getDragData = useCallback(() => getSharedDragData(), []);

  return {
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDrop,
    dropChatOnChat,
    getDragData,
  };
}
