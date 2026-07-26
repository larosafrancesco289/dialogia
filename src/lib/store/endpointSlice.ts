// Module: store/endpointSlice
// Responsibility: Own the user's endpoint configuration (never their keys, which
// live in `@/lib/keys/store`). The request path reads endpoints synchronously
// from `transport/endpointRegistry`, so every mutation republishes there.

import { deleteKey } from '@/lib/keys/store';
import { createStoreSlice } from '@/lib/store/createSlice';
import type { PersistFragment, StoreState } from '@/lib/store/types';
import {
  endpointKeyRef,
  isBuiltInEndpointId,
  normalizeBaseUrl,
  slugifyEndpointId,
  type ProviderEndpoint,
} from '@/lib/transport/endpoints';
import { setCustomEndpoints } from '@/lib/transport/endpointRegistry';
import { isRecord } from '@/lib/utils/guards';

export type EndpointSliceState = {
  /** User-added endpoints only; the two built-ins are implicit and non-deletable. */
  customEndpoints: ProviderEndpoint[];
};

export type EndpointSliceActions = {
  addEndpoint: (
    draft: Omit<ProviderEndpoint, 'id' | 'apiKeyRef'> & { id?: string },
  ) => ProviderEndpoint;
  updateEndpoint: (id: string, patch: Partial<Omit<ProviderEndpoint, 'id' | 'apiKeyRef'>>) => void;
  removeEndpoint: (id: string) => void;
};

function sanitizeEndpoint(value: unknown): ProviderEndpoint | null {
  if (!isRecord(value)) return null;
  const { id, kind, label } = value;
  if (typeof id !== 'string' || !id || isBuiltInEndpointId(id)) return null;
  if (kind !== 'openrouter' && kind !== 'anthropic' && kind !== 'openai-compatible') return null;
  if (typeof label !== 'string' || !label) return null;
  const modelIds = Array.isArray(value.modelIds)
    ? value.modelIds.filter((entry): entry is string => typeof entry === 'string' && !!entry)
    : undefined;
  return {
    id,
    kind,
    label,
    baseUrl: typeof value.baseUrl === 'string' ? normalizeBaseUrl(value.baseUrl) : undefined,
    // Always derived, never read from the blob: an imported backup could
    // otherwise point an attacker's URL at the key of a built-in endpoint.
    apiKeyRef: endpointKeyRef(id),
    capabilities: isRecord(value.capabilities)
      ? (value.capabilities as ProviderEndpoint['capabilities'])
      : undefined,
    modelIds,
    titleModelId: typeof value.titleModelId === 'string' ? value.titleModelId : undefined,
    disableTitleGeneration: value.disableTitleGeneration === true ? true : undefined,
  };
}

export function parseCustomEndpoints(value: unknown): ProviderEndpoint[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const endpoints: ProviderEndpoint[] = [];
  for (const entry of value) {
    const endpoint = sanitizeEndpoint(entry);
    if (!endpoint || seen.has(endpoint.id)) continue;
    seen.add(endpoint.id);
    endpoints.push(endpoint);
  }
  return endpoints;
}

export const endpointPersistFragment: PersistFragment = {
  partialize: (state) => ({ customEndpoints: state.customEndpoints }),
  merge: (_current, persisted) => {
    const customEndpoints = parseCustomEndpoints(persisted.customEndpoints);
    setCustomEndpoints(customEndpoints);
    return { customEndpoints };
  },
};

export const createEndpointSlice = createStoreSlice<EndpointSliceState & EndpointSliceActions>(
  (set, get) => {
    const publish = (endpoints: ProviderEndpoint[]) => {
      setCustomEndpoints(endpoints);
      set({ customEndpoints: endpoints });
    };

    return {
      customEndpoints: [],

      addEndpoint(draft) {
        const existing = get().customEndpoints;
        const id =
          draft.id ||
          slugifyEndpointId(
            draft.label,
            existing.map((e) => e.id),
          );
        const endpoint: ProviderEndpoint = {
          ...draft,
          id,
          baseUrl: draft.baseUrl ? normalizeBaseUrl(draft.baseUrl) : undefined,
          apiKeyRef: endpointKeyRef(id),
        };
        publish([...existing.filter((e) => e.id !== id), endpoint]);
        return endpoint;
      },

      updateEndpoint(id, patch) {
        if (isBuiltInEndpointId(id)) return;
        publish(
          get().customEndpoints.map((endpoint) =>
            endpoint.id === id
              ? {
                  ...endpoint,
                  ...patch,
                  id,
                  baseUrl: patch.baseUrl ? normalizeBaseUrl(patch.baseUrl) : endpoint.baseUrl,
                }
              : endpoint,
          ),
        );
      },

      removeEndpoint(id) {
        if (isBuiltInEndpointId(id)) return;
        publish(get().customEndpoints.filter((endpoint) => endpoint.id !== id));
        // The ref is derived from the id, so an orphaned key would be re-bound
        // to whatever host the next endpoint slugged the same way points at.
        void deleteKey(endpointKeyRef(id));
      },
    } satisfies Partial<StoreState>;
  },
);
