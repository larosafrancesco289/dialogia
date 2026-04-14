// Module: services/auth
// Responsibility: Resolve per-model auth for UI-driven turns and surface missing-key notices.

import { requireModelAuth } from '@/lib/auth/require';
import type { ModelIndex } from '@/lib/models';
import { resolveModelTransport } from '@/lib/providers';
import type { ModelTransport } from '@/lib/types';
import type { StoreGetter, StoreSetter } from '@/lib/agent/types';
import { NOTICE_MISSING_ANTHROPIC_KEY, NOTICE_MISSING_CLIENT_KEY } from '@/lib/store/notices';
import { notify } from '@/lib/store/notify';
import { isRecord } from '@/lib/utils/guards';
import type { TransportAuth } from '@/lib/auth/transport';

export type ModelAuth = TransportAuth;

export type ModelAuthResolver = {
  get: (modelId?: string) => ModelAuth | null;
  ensureAll: (modelIds: Iterable<string>) => boolean;
};

const noticeForTransport = (transport?: ModelTransport) =>
  transport === 'anthropic' ? NOTICE_MISSING_ANTHROPIC_KEY : NOTICE_MISSING_CLIENT_KEY;

const notifyMissingAuth = (getState: StoreGetter, transport?: ModelTransport) => {
  const notice = noticeForTransport(transport);
  notify(getState, notice);
};

export const createModelAuthResolver = ({
  modelIndex,
  set: _set,
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
      const transport =
        isRecord(error) && typeof error.transport === 'string'
          ? (error.transport as ModelTransport)
          : undefined;
      notifyMissingAuth(getState, transport);
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
  set: _set,
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
    const meta = modelIndex.get(modelId);
    const transport =
      isRecord(error) && typeof error.transport === 'string'
        ? (error.transport as ModelTransport)
        : resolveModelTransport(modelId, meta);
    notifyMissingAuth(getState, transport);
    return null;
  }
};
