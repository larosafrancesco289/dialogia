'use client';
import { useRef } from 'react';
import { useChatStore } from '@/lib/store';

export interface DragData {
  id: string;
  type: 'folder' | 'chat';
}

export function useDragAndDrop() {
  const { moveChatToFolder } = useChatStore();
  const dragDataRef = useRef<DragData | null>(null);

  const handleDragStart = (id: string, type: 'folder' | 'chat') => {
    dragDataRef.current = { id, type };
  };

  const handleDragEnd = () => {
    dragDataRef.current = null;
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (targetFolderId?: string) => {
    const data = dragDataRef.current;
    if (!data) return;
    if (data.type === 'chat') {
      await moveChatToFolder(data.id, targetFolderId);
    }
    dragDataRef.current = null;
  };

  const getDragData = () => dragDataRef.current;

  return {
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDrop,
    getDragData,
  };
}
