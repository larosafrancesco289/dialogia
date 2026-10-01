import { useSyncExternalStore } from 'react';
import { shallow } from 'zustand/shallow';
import {
  describeKey,
  hasKey,
  isKeyRejected,
  keysRead,
  listKeyRefs,
  subscribeToKeys,
} from '@/lib/keys/store';
import { isEndpointUsable } from '@/lib/auth/require';
import { useChatStore } from '@/lib/store';
import { BUILT_IN_ENDPOINTS } from '@/lib/transport/endpoints';

/**
 * Re-renders when a key is added, removed or refused. The snapshot is the set of refs
 * that hold a key, never the key values — nothing in the React tree should be
 * able to read one by accident.
 */
export function useProviderKeys(): {
  hasKey: (ref?: string) => boolean;
  describeKey: (ref?: string) => string | undefined;
  isKeyRejected: (ref?: string) => boolean;
} {
  useSyncExternalStore(
    subscribeToKeys,
    () =>
      listKeyRefs()
        .sort()
        .map((ref) => (isKeyRejected(ref) ? `${ref}!` : ref))
        .join('|'),
    () => '',
  );
  return { hasKey, describeKey, isKeyRejected };
}

/**
 * Whether any provider has a model to offer: one holds a key, or is a keyless
 * server with a model. True until the keys have been read, so an app that is
 * connected never flashes its setup state while it starts.
 */
export function useAnyProviderConnected(): boolean {
  const { customEndpoints, models } = useChatStore(
    (s) => ({ customEndpoints: s.customEndpoints, models: s.models }),
    shallow,
  );
  return useSyncExternalStore(
    subscribeToKeys,
    () =>
      !keysRead() ||
      [...BUILT_IN_ENDPOINTS, ...customEndpoints].some((endpoint) =>
        isEndpointUsable(endpoint, models),
      ),
    () => true,
  );
}
