import { useSyncExternalStore } from 'react';
import { describeKey, hasKey, listKeyRefs, subscribeToKeys } from '@/lib/keys/store';

/**
 * Re-renders when a key is added or removed. The snapshot is the set of refs
 * that hold a key, never the key values — nothing in the React tree should be
 * able to read one by accident.
 */
export function useProviderKeys(): {
  hasKey: (ref?: string) => boolean;
  describeKey: (ref?: string) => string | undefined;
} {
  useSyncExternalStore(
    subscribeToKeys,
    () => listKeyRefs().sort().join('|'),
    () => '',
  );
  return { hasKey, describeKey };
}
