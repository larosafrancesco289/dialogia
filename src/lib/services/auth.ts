import { requireModelAuth } from '@/lib/auth/require';
import type { ModelIndex } from '@/lib/models';
import { resolveModelTransport } from '@/lib/providers';
import type { ModelTransport } from '@/lib/types';
import type { StoreSetter } from '@/lib/agent/types';
import { NOTICE_MISSING_ANTHROPIC_KEY, NOTICE_MISSING_CLIENT_KEY } from '@/lib/store/notices';

export type ModelAuth = ReturnType<typeof requireModelAuth>;

export type ModelAuthResolver = {
  get: (modelId?: string) => ModelAuth | null;
  ensureAll: (modelIds: Iterable<string>) => boolean;
};

const noticeForTransport = (transport?: ModelTransport) =>
  transport === 'anthropic' ? NOTICE_MISSING_ANTHROPIC_KEY : NOTICE_MISSING_CLIENT_KEY;

const notifyMissingAuth = (set: StoreSetter, transport?: ModelTransport) => {
  const notice = noticeForTransport(transport);
  set((state) => ({ ui: { ...state.ui, notice } }));
};

export const createModelAuthResolver = ({
  modelIndex,
  set,
}: {
  modelIndex: ModelIndex;
  set: StoreSetter;
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
      const transport = (error as any)?.transport as ModelTransport | undefined;
      notifyMissingAuth(set, transport);
      throw error;
    }
  };

  const get = (modelId?: string): ModelAuth | null => {
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

  return { get, ensureAll };
};

export const resolveSingleModelAuth = ({
  modelId,
  modelIndex,
  set,
}: {
  modelId?: string;
  modelIndex: ModelIndex;
  set: StoreSetter;
}): ModelAuth | null => {
  if (!modelId) return null;
  try {
    return requireModelAuth(modelId, modelIndex);
  } catch (error) {
    const meta = modelIndex.get(modelId);
    const transport = ((error as any)?.transport ?? resolveModelTransport(modelId, meta)) as
      | ModelTransport
      | undefined;
    notifyMissingAuth(set, transport);
    return null;
  }
};
