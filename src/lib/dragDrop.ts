'use client';
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

  const getDragData = useCallback(() => getSharedDragData(), []);

  return {
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDrop,
    getDragData,
  };
}
