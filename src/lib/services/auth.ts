// Module: services/auth
// Responsibility: Resolve per-model auth for UI-driven turns and open the setup
// flow when a provider is not configured yet.

import {
  MISSING_PROVIDER_KEY,
  requireModelAuth,
  type MissingProviderKeyError,
} from '@/lib/auth/require';
import { formatModelLabel } from '@/lib/models/labels';
import type { ModelIndex } from '@/lib/models';
import type { StoreGetter, StoreSetter } from '@/lib/agent/types';
import type { TransportAuth } from '@/lib/auth/transport';
import { isUnknownEndpointError } from '@/lib/transport/endpointRegistry';
import { NOTICE_UNKNOWN_ENDPOINT } from '@/lib/store/notices';
import { notify } from '@/lib/store/notify';
import { guardZdrOrNotifyCached } from '@/lib/policy/zdr/cache';

export type ModelAuth = TransportAuth;

export type ModelAuthResolver = {
  get: (modelId?: string) => ModelAuth | null;
  ensureAll: (modelIds: Iterable<string>) => boolean;
};

/**
 * A missing key is a setup problem, not an error to narrate: open the setup
 * sheet rather than dropping a toast that names an environment variable.
 */
const promptForSetup = (set: StoreSetter, setupReason?: string) => {
  set((state) => ({ ui: { ...state.ui, setupOpen: true, setupReason } }));
};

/**
 * A deleted endpoint is not a setup problem the sheet can fix: say so instead of
 * offering a key field for a provider that is gone.
 */
const reportAuthFailure = (
  error: unknown,
  set: StoreSetter,
  get: StoreGetter,
  modelId: string,
  modelIndex: ModelIndex,
) => {
  if (isUnknownEndpointError(error)) {
    notify(get, NOTICE_UNKNOWN_ENDPOINT);
    return;
  }
  // Say which model needed it: with a server of their own connected, "Connect
  // a model" alone reads as if that connection had been lost (Learn runs on
  // OpenRouter, say).
  const missing = (error as MissingProviderKeyError)?.code === MISSING_PROVIDER_KEY;
  const provider = missing ? (error as MissingProviderKeyError).endpointLabel : undefined;
  const name = formatModelLabel({ model: modelIndex.get(modelId), fallbackId: modelId });
  promptForSetup(
    set,
    provider ? `${name} runs on ${provider}. Add your ${provider} key to use it.` : undefined,
  );
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
      reportAuthFailure(error, set, getState, modelId, modelIndex);
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
    reportAuthFailure(error, set, getState, modelId, modelIndex);
    return null;
  }
};

/**
 * Whether a message for this model could go out now. Asked before the composer
 * lets go of the draft, since a refusal after that would take the text with it.
 */
export const canSendWithModel = (
  modelId: string | undefined,
  set: StoreSetter,
  get: StoreGetter,
): boolean => {
  if (!modelId) return true;
  if (!resolveSingleModelAuth({ modelId, modelIndex: get().modelIndex, set, get })) return false;
  return get().ui.zdrOnly !== true || guardZdrOrNotifyCached(modelId, set, get);
};
