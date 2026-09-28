import { useSyncExternalStore } from 'react';
import { describeKey, hasKey, keysRead, listKeyRefs, subscribeToKeys } from '@/lib/keys/store';
import { isEndpointConnected } from '@/lib/auth/require';
import { useChatStore } from '@/lib/store';
import { BUILT_IN_ENDPOINTS } from '@/lib/transport/endpoints';

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

/**
 * Whether any provider can be called: one holds a key, or is a server that
 * takes none. True until the keys have been read, so an app that is connected
 * never flashes its setup state while it starts.
 */
export function useAnyProviderConnected(): boolean {
  const customEndpoints = useChatStore((s) => s.customEndpoints);
  return useSyncExternalStore(
    subscribeToKeys,
    () => !keysRead() || [...BUILT_IN_ENDPOINTS, ...customEndpoints].some(isEndpointConnected),
    () => true,
  );
}
