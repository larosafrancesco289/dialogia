// Module: services/auth
// Responsibility: Resolve per-model auth for UI-driven turns and open the setup
// flow when a provider is not configured yet.

import { requireModelAuth } from '@/lib/auth/require';
import type { ModelIndex } from '@/lib/models';
import type { StoreGetter, StoreSetter } from '@/lib/agent/types';
import type { TransportAuth } from '@/lib/auth/transport';
import { isUnknownEndpointError } from '@/lib/transport/endpointRegistry';
import { NOTICE_UNKNOWN_ENDPOINT } from '@/lib/store/notices';
import { notify } from '@/lib/store/notify';

export type ModelAuth = TransportAuth;

export type ModelAuthResolver = {
  get: (modelId?: string) => ModelAuth | null;
  ensureAll: (modelIds: Iterable<string>) => boolean;
};

/**
 * A missing key is a setup problem, not an error to narrate: open the setup
 * sheet rather than dropping a toast that names an environment variable.
 */
const promptForSetup = (set: StoreSetter) => {
  set((state) => ({ ui: { ...state.ui, setupOpen: true } }));
};

/**
 * A deleted endpoint is not a setup problem the sheet can fix: say so instead of
 * offering a key field for a provider that is gone.
 */
const reportAuthFailure = (error: unknown, set: StoreSetter, get: StoreGetter) => {
  if (isUnknownEndpointError(error)) {
    notify(get, NOTICE_UNKNOWN_ENDPOINT);
    return;
  }
  promptForSetup(set);
};

export const createModelAuthResolver = ({
  modelIndex,
  set,
  get: getState,
}: {
  modelIndex: ModelIndex;
  set: StoreSetter;
  get: StoreGetter;
}): ModelAuthResolver => {
  const cache = new Map<string, ModelAuth>();

  const fetch = (modelId?: string): ModelAuth | null => {
    if (!modelId) return null;
    const cached = cache.get(modelId);
    if (cached) return cached;
    try {
      const auth = requireModelAuth(modelId, modelIndex);
      cache.set(modelId, auth);
      return auth;
    } catch (error) {
      reportAuthFailure(error, set, getState);
      throw error;
    }
  };

  const getAuth = (modelId?: string): ModelAuth | null => {
    try {
      return fetch(modelId);
    } catch {
      return null;
    }
  };

  const ensureAll = (modelIds: Iterable<string>): boolean => {
    try {
      for (const id of modelIds) {
        if (!id) continue;
        fetch(id);
      }
      return true;
    } catch {
      return false;
    }
  };

  return { get: getAuth, ensureAll };
};

export const resolveSingleModelAuth = ({
  modelId,
  modelIndex,
  set,
  get: getState,
}: {
  modelId?: string;
  modelIndex: ModelIndex;
  set: StoreSetter;
  get: StoreGetter;
}): ModelAuth | null => {
  if (!modelId) return null;
  try {
    return requireModelAuth(modelId, modelIndex);
  } catch (error) {
    reportAuthFailure(error, set, getState);
    return null;
  }
};
