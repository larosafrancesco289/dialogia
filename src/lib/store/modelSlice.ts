import type { PersistFragment, StoreState } from '@/lib/store/types';
import { requireEndpointAuth } from '@/lib/auth/require';
import { loadKeys, markKeyRejected } from '@/lib/keys/store';
import { isLocalServer, ZDR_UNAVAILABLE_NOTICE } from '@/lib/policy/zdr';
import { computeZdrFilterCached } from '@/lib/policy/zdr/cache';
import type { ModelIndex } from '@/lib/models';
import { createModelIndex, EMPTY_MODEL_INDEX, resolveDefaultModelId } from '@/lib/models';
import { reconcileModelDefaults } from '@/lib/models/defaultResolutions';
import { createStoreSlice } from '@/lib/store/createSlice';
import { API_ERROR_CODES, isApiError } from '@/lib/api/errors';
import { getTransportClient } from '@/lib/transport/registry';
import { listEndpoints } from '@/lib/transport/endpointRegistry';
import { describeNoModelsOffered, NOTICE_INVALID_KEY } from '@/lib/store/notices';
import { notify } from '@/lib/store/notify';
import { getMessagesForChat } from '@/lib/messages/indexing';
import { ChatService } from '@/lib/services/chatService';
import { repository } from '@/lib/db';
import type { ModelDescriptor } from '@/lib/types';

export type ModelSliceState = {
  models: ModelDescriptor[];
  modelIndex: ModelIndex;
  favoriteModelIds: string[];
  /** No longer written or read; kept so a stored list survives (persisted key set). */
  hiddenModelIds: string[];
  // Cached ZDR model/provider ids, persisted so ZDR_CACHE_TTL_MS survives reloads.
  zdrModelIds?: string[];
  zdrProviderIds?: string[];
  zdrFetchedAt?: number;
};

export type ModelSliceActions = {
  /** `showErrors` repeats a failure already reported this session (an explicit refresh). */
  loadModels: (opts?: { showErrors?: boolean }) => Promise<void>;
  toggleFavoriteModel: (id: string) => void;
};

export const modelPersistFragment: PersistFragment = {
  partialize: (state) => ({
    favoriteModelIds: state.favoriteModelIds,
    hiddenModelIds: state.hiddenModelIds,
    zdrModelIds: state.zdrModelIds,
    zdrProviderIds: state.zdrProviderIds,
    zdrFetchedAt: state.zdrFetchedAt,
  }),
};

/** fetch rejects with a TypeError when nothing answers, and aborts when an answer never comes. */
const isUnreachable = (error: unknown) =>
  error instanceof TypeError || (error instanceof Error && error.name === 'AbortError');

/** The open chat, when nothing has been said in it yet. */
function openEmptyChat(state: StoreState) {
  const chat = state.chats.find((c) => c.id === state.selectedChatId);
  if (!chat || !state.loadedMessageChatIds[chat.id] || state.nonEmptyChatIds[chat.id]) return;
  return getMessagesForChat(state, chat.id).length === 0 ? chat : undefined;
}

export const createModelSlice = createStoreSlice<ModelSliceState & ModelSliceActions>(
  (set, get) => {
    let running: Promise<void> | null = null;
    // A load asked for while one runs (a server added mid-load) runs once more
    // after it, so what changed meanwhile is read.
    let rerun: Promise<void> | null = null;
    let rerunShowsErrors = false;
    // Servers already reported as unreachable this session. Every load (each
    // Settings open) would otherwise raise the same notice while one stays down.
    const reportedUnreachable = new Set<string>();

    const load = async (opts?: { showErrors?: boolean }) => {
      // Memoized: only the first caller actually reads IndexedDB.
      await loadKeys();
      const authEntries = listEndpoints().flatMap((endpoint) => {
        try {
          return [[endpoint, requireEndpointAuth(endpoint)] as const];
        } catch {
          return [];
        }
      });
      if (authEntries.length === 0) {
        // Nothing is configured yet: the welcome page asks for a key in the
        // composer's place, so there is nothing to say here.
        return;
      }

      const zdrOnly = get().ui.zdrOnly === true;
      const modelsByEndpoint = new Map<string, StoreState['models']>();
      const noticeSegments: string[] = [];

      let zdrUnavailable = false;
      let hadUnauthorizedFailure = false;
      let quietedRepeat = false;

      await Promise.all(
        authEntries.map(async ([endpoint, auth]) => {
          // The ZDR list only describes OpenRouter's providers, so ZDR-only
          // mode can vouch for nothing else but the person's own local server.
          if (endpoint.kind !== 'openrouter' && zdrOnly && !isLocalServer(endpoint)) {
            modelsByEndpoint.set(endpoint.id, []);
            noticeSegments.push(
              `${endpoint.label} models are hidden: zero data retention is on, and only OpenRouter can promise it.`,
            );
            return;
          }

          try {
            const transportClient = getTransportClient(endpoint.kind);
            let models = await transportClient.fetchModels(auth);

            if (endpoint.kind === 'openrouter') {
              const { filter, filtered } = await computeZdrFilterCached(
                models,
                zdrOnly ? 'enforce' : 'informational',
                set,
                get,
              );
              if (zdrOnly && filter.status === 'unknown') {
                zdrUnavailable = true;
                models = [];
              } else {
                models = filtered;
              }
            }

            modelsByEndpoint.set(endpoint.id, models);
            reportedUnreachable.delete(endpoint.id);
          } catch (error: unknown) {
            modelsByEndpoint.set(endpoint.id, []);
            if (isApiError(error) && error.code === API_ERROR_CODES.UNAUTHORIZED) {
              hadUnauthorizedFailure = true;
              markKeyRejected(endpoint.apiKeyRef, auth.apiKey);
              noticeSegments.push(`${endpoint.label} models unavailable: the key was rejected.`);
              return;
            }

            if (isApiError(error) && error.code === API_ERROR_CODES.RATE_LIMITED) {
              noticeSegments.push(`${endpoint.label} models unavailable: rate limited.`);
              return;
            }

            if (isUnreachable(error)) {
              if (reportedUnreachable.has(endpoint.id) && !opts?.showErrors) {
                quietedRepeat = true;
                return;
              }
              reportedUnreachable.add(endpoint.id);
              noticeSegments.push(`Could not reach ${endpoint.label}.`);
              return;
            }

            noticeSegments.push(`${endpoint.label} models unavailable right now.`);
          }
        }),
      );

      const mergedModels = authEntries.flatMap(
        ([endpoint]) => modelsByEndpoint.get(endpoint.id) ?? [],
      );
      const defaults = reconcileModelDefaults(
        mergedModels,
        get().ui.dynamicDefaultResolutions ?? {},
      );
      const { resolutions } = defaults;
      noticeSegments.push(...defaults.notices);
      if (resolutions) {
        set((s) => ({ ui: { ...s.ui, dynamicDefaultResolutions: resolutions } }));
      }

      if (mergedModels.length === 0) {
        if (zdrOnly && zdrUnavailable) {
          notify(get, ZDR_UNAVAILABLE_NOTICE);
          return;
        }
        if (hadUnauthorizedFailure && authEntries.length === 1) {
          notify(get, NOTICE_INVALID_KEY);
          return;
        }
        if (noticeSegments.length > 0 && !get().ui.notice) {
          notify(get, noticeSegments.join(' '), 'info');
          return;
        }
        if (quietedRepeat) return;
        // Every endpoint answered, with no models and nothing to say why.
        if (!get().ui.notice) {
          notify(get, describeNoModelsOffered(authEntries.map(([endpoint]) => endpoint.label)));
        }
        return;
      }

      if (zdrOnly && zdrUnavailable && !(get().ui.notice || noticeSegments.length > 0)) {
        notify(get, ZDR_UNAVAILABLE_NOTICE);
      }

      // An unserved default needs no staging: new chats already start with
      // resolveDefaultModelId, and a staged model would sit over the open
      // chat's own in the composer while the header named the chat's.
      if (noticeSegments.length > 0 && !get().ui.notice) {
        notify(get, noticeSegments.join(' '), 'info');
      }
      set({ models: mergedModels, modelIndex: createModelIndex(mergedModels) });

      // A chat opened before anything was connected names a model nobody
      // serves; while nothing is said in it, it takes what new chats start
      // with. Not a choice of the reader's, so not kept for later chats.
      const empty = openEmptyChat(get());
      const modelId = empty?.settings.modelId;
      if (
        modelId &&
        !empty.settings.features.tutor?.enabled &&
        !mergedModels.some((model) => model.id === modelId)
      ) {
        const settings = { ...empty.settings, modelId: resolveDefaultModelId(mergedModels) };
        const updated = await ChatService.updateChat(empty, { settings }, repository, {
          touch: false,
        });
        set((s) => ({ chats: s.chats.map((chat) => (chat.id === updated.id ? updated : chat)) }));
      }
    };

    return {
      models: [],
      favoriteModelIds: [],
      hiddenModelIds: [],
      modelIndex: EMPTY_MODEL_INDEX,
      zdrModelIds: undefined,
      zdrProviderIds: undefined,
      zdrFetchedAt: undefined,

      loadModels(opts?: { showErrors?: boolean }) {
        if (running) {
          rerunShowsErrors ||= !!opts?.showErrors;
          rerun ??= running.then(() => {
            const showErrors = rerunShowsErrors;
            rerun = null;
            rerunShowsErrors = false;
            return get().loadModels({ showErrors });
          });
          return rerun;
        }
        running = load(opts).finally(() => {
          running = null;
        });
        return running;
      },

      toggleFavoriteModel(id: string) {
        set((s) => ({
          favoriteModelIds: s.favoriteModelIds.includes(id)
            ? s.favoriteModelIds.filter((m) => m !== id)
            : [id, ...s.favoriteModelIds],
        }));
      },
    } satisfies Partial<StoreState>;
  },
);
