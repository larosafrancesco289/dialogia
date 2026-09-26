import { useEffect } from 'react';
import { useChatStore } from '@/lib/store';
import type { AutoSaveStatus } from '@/components/settings/hooks/useAutoSave';

/**
 * Settings save as you go, and the control's own state already shows the
 * change, so a save that lands says nothing. Only a failure is said, in the
 * app's one toast.
 */
export function useSaveNotice(status: AutoSaveStatus) {
  const setNotice = useChatStore((s) => s.setNotice);
  useEffect(() => {
    if (status === 'error') setNotice('Settings could not be saved. Try the change again.');
  }, [status, setNotice]);
}
