import { useEffect } from 'react';
import { useChatStore } from '@/lib/store';
import type { AutoSaveStatus } from '@/components/settings/hooks/useAutoSave';

/**
 * Settings save as you go; a save that lands, or fails, is said in the app's
 * one toast. Saving itself is too quick to announce.
 */
export function useSaveNotice(status: AutoSaveStatus) {
  const setNotice = useChatStore((s) => s.setNotice);
  useEffect(() => {
    if (status === 'saved') setNotice('Saved', 'success');
    else if (status === 'error') setNotice('Settings could not be saved. Try the change again.');
  }, [status, setNotice]);
}
