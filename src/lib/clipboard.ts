// Module: clipboard
// Responsibility: One copy path for every copy button, so a copy the browser
// blocks (no permission, insecure context, unfocused page) is said out loud
// instead of looking like it worked.

import { logger } from '@/lib/logger';
import { useChatStore } from '@/lib/store';

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    logger.warn('[clipboard] Copy failed', error);
    useChatStore.getState().setNotice('copyFailed');
    return false;
  }
}
