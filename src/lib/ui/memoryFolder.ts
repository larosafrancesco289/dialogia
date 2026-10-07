// Module: ui/memoryFolder
// Responsibility: The built-in memory folders' names and descriptions as shown.
// They are stored in English when memory is first made, and the model reads
// them so; on screen, until the person rewrites them, they are said in the
// language shown.

import { t, type MessageKey } from '@/lib/i18n';
import { MEMORY_ABOUT_FOLDER_ID, MEMORY_LEARNING_FOLDER_ID, type MemoryFolder } from '@/lib/types';
import { BUILT_IN_FOLDERS } from '@/lib/memory/notebook';

const SHOWN: Record<string, { name: MessageKey; description: MessageKey }> = {
  [MEMORY_ABOUT_FOLDER_ID]: {
    name: 'memory.folder.about',
    description: 'memory.folder.aboutDescription',
  },
  [MEMORY_LEARNING_FOLDER_ID]: {
    name: 'memory.folder.learning',
    description: 'memory.folder.learningDescription',
  },
};

const builtIn = (id: string) => BUILT_IN_FOLDERS.find((folder) => folder.id === id);

export function folderName(folder: Pick<MemoryFolder, 'id' | 'name'>): string {
  const keys = SHOWN[folder.id];
  return keys && folder.name === builtIn(folder.id)?.name ? t(keys.name) : folder.name;
}

export function folderDescription(folder: Pick<MemoryFolder, 'id' | 'description'>): string {
  const keys = SHOWN[folder.id];
  return keys && folder.description === builtIn(folder.id)?.description
    ? t(keys.description)
    : folder.description;
}
