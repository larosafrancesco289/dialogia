import type { PersistFragment, StoreState } from '@/lib/store/types';
import { requireEndpointAuth } from '@/lib/auth/require';
import { loadKeys, markKeyRejected } from '@/lib/keys/store';
import { ZDR_UNAVAILABLE_NOTICE } from '@/lib/policy/zdr';
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
import type { ModelDescriptor } from '@/lib/types';

export type ModelSliceState = {
  models: ModelDescriptor[];
  modelIndex: ModelIndex;
  favoriteModelIds: string[];
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
  hideModel: (id: string) => void;
  unhideModel: (id: string) => void;
  resetHiddenModels: () => void;
  removeModelFromDropdown: (id: string) => void;
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

export const createModelSlice = createStoreSlice<ModelSliceState & ModelSliceActions>(
  (set, get) => {
    let isLoadingModels = false;
    // Servers already reported as unreachable this session. Every load (each
    // Settings open) would otherwise raise the same notice while one stays down.
    const reportedUnreachable = new Set<string>();

    return {
      models: [],
      favoriteModelIds: [],
      hiddenModelIds: [],
      modelIndex: EMPTY_MODEL_INDEX,
      zdrModelIds: undefined,
      zdrProviderIds: undefined,
      zdrFetchedAt: undefined,

      async loadModels(opts?: { showErrors?: boolean }) {
        if (isLoadingModels) return;
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
          // Nothing is configured yet: the setup flow is the answer, not a toast.
          // Inside Settings, Connections is already that answer; the sheet would
          // only stack on top of it. Once put away, it waits to be asked for.
          const { showSettings, setupDismissed } = get().ui;
          if (!showSettings && !setupDismissed) set((s) => ({ ui: { ...s.ui, setupOpen: true } }));
          return;
        }

        isLoadingModels = true;
        try {
          const zdrOnly = get().ui.zdrOnly === true;
          const modelsByEndpoint = new Map<string, StoreState['models']>();
          const noticeSegments: string[] = [];

          let zdrUnavailable = false;
          let hadUnauthorizedFailure = false;
          let quietedRepeat = false;

          await Promise.all(
            authEntries.map(async ([endpoint, auth]) => {
              // The ZDR list only describes OpenRouter's providers, so ZDR-only
              // mode can vouch for nothing else.
              if (endpoint.kind !== 'openrouter' && zdrOnly) {
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
                  noticeSegments.push(
                    `${endpoint.label} models unavailable: the API key was rejected.`,
                  );
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
        } finally {
          isLoadingModels = false;
        }
      },

      toggleFavoriteModel(id: string) {
        set((s) => ({
          favoriteModelIds: s.favoriteModelIds.includes(id)
            ? s.favoriteModelIds.filter((m) => m !== id)
            : [id, ...s.favoriteModelIds],
        }));
      },

      hideModel(id: string) {
        // The model new chats start with stays pickable.
        if (id === resolveDefaultModelId(get().models)) return;
        set((s) => ({
          hiddenModelIds: s.hiddenModelIds.includes(id)
            ? s.hiddenModelIds
            : [id, ...s.hiddenModelIds],
        }));
      },

      unhideModel(id: string) {
        set((s) => ({ hiddenModelIds: s.hiddenModelIds.filter((m) => m !== id) }));
      },

      resetHiddenModels() {
        set({ hiddenModelIds: [] });
      },

      removeModelFromDropdown(id: string) {
        if (id === resolveDefaultModelId(get().models)) return;
        set((s) => {
          const isFavorite = s.favoriteModelIds.includes(id);
          if (isFavorite) {
            return { favoriteModelIds: s.favoriteModelIds.filter((m) => m !== id) };
          }
          if (s.hiddenModelIds.includes(id)) return {};
          return { hiddenModelIds: [id, ...s.hiddenModelIds] };
        });
      },
    } satisfies Partial<StoreState>;
  },
);
