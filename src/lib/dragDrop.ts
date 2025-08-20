'use client';
import { useChatStore } from '@/lib/store';

export interface DragData {
  id: string;
  type: 'folder' | 'chat';
}

export function useDragAndDrop() {
  const { moveChatToFolder } = useChatStore();
  
  // Handle drag start
  const handleDragStart = (id: string, type: 'folder' | 'chat') => {
    const dragData: DragData = { id, type };
    // Store drag data in a way that persists across the drag operation
    // We'll use a data attribute on the dragged element
    return dragData;
  };

  // Handle drag over (required for drop to work)
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  // Handle drop
  const handleDrop = async (targetFolderId: string | undefined, draggedId: string, draggedType: 'folder' | 'chat') => {
    if (draggedType === 'chat') {
      // Move chat to folder (or root if targetFolderId is undefined)
      await moveChatToFolder(draggedId, targetFolderId);
    }
    // For now, we don't support moving folders into other folders
    // This could be added later for nested folder functionality
  };

  return {
    handleDragStart,
    handleDragOver,
    handleDrop,
  };
}

// Global drag state management for tracking what's being dragged
let currentDragData: DragData | null = null;

export function setCurrentDragData(data: DragData | null) {
  currentDragData = data;
}

export function getCurrentDragData(): DragData | null {
  return currentDragData;
}
