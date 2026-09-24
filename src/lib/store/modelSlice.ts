import type { PersistFragment, StoreState } from '@/lib/store/types';
import { requireEndpointAuth } from '@/lib/auth/require';
import { loadKeys } from '@/lib/keys/store';
import { ZDR_UNAVAILABLE_NOTICE } from '@/lib/policy/zdr';
import { computeZdrFilterCached } from '@/lib/policy/zdr/cache';
import { DEFAULT_MODEL_ID, DEFAULT_MODEL_NAME } from '@/lib/constants';
import type { ModelIndex } from '@/lib/models';
import {
  createModelIndex,
  EMPTY_MODEL_INDEX,
  findModelById,
  formatModelLabel,
  isDynamicModelId,
  resolveDefaultModelId,
  resolveDynamicModelId,
} from '@/lib/models';
import { CURATED_MODELS } from '@/data/curatedModels';
import { createStoreSlice } from '@/lib/store/createSlice';
import { API_ERROR_CODES, isApiError } from '@/lib/api/errors';
import { getTransportClient } from '@/lib/transport/registry';
import { listEndpoints } from '@/lib/transport/endpointRegistry';
import { NOTICE_INVALID_KEY, NOTICE_MODELS_UNAVAILABLE } from '@/lib/store/notices';
import { applyNextOverrides, readNextOverrides } from '@/lib/ui/next';
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

export const createModelSlice = createStoreSlice<ModelSliceState & ModelSliceActions>(
  (set, get) => {
    let isLoadingModels = false;

    return {
      models: [],
      favoriteModelIds: [],
      hiddenModelIds: [],
      modelIndex: EMPTY_MODEL_INDEX,
      zdrModelIds: undefined,
      zdrProviderIds: undefined,
      zdrFetchedAt: undefined,

      async loadModels(_opts?: { showErrors?: boolean }) {
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
          set((s) => ({ ui: { ...s.ui, setupOpen: true } }));
          return;
        }

        isLoadingModels = true;
        try {
          const zdrOnly = get().ui.zdrOnly === true;
          const modelsByEndpoint = new Map<string, StoreState['models']>();
          const noticeSegments: string[] = [];
          let fallbackModelId: string | undefined;
          let defaultModelAvailable = false;

          let zdrUnavailable = false;
          let hadUnauthorizedFailure = false;

          await Promise.all(
            authEntries.map(async ([endpoint, auth]) => {
              // The ZDR list only describes OpenRouter's providers, so ZDR-only
              // mode can vouch for nothing else.
              if (endpoint.kind !== 'openrouter' && zdrOnly) {
                modelsByEndpoint.set(endpoint.id, []);
                noticeSegments.push(
                  `${endpoint.label} models are hidden while ZDR-only mode is enabled.`,
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
              } catch (error: unknown) {
                modelsByEndpoint.set(endpoint.id, []);
                if (isApiError(error) && error.code === API_ERROR_CODES.UNAUTHORIZED) {
                  hadUnauthorizedFailure = true;
                  noticeSegments.push(`${endpoint.label} models unavailable: invalid API key.`);
                  return;
                }

                if (isApiError(error) && error.code === API_ERROR_CODES.RATE_LIMITED) {
                  noticeSegments.push(`${endpoint.label} models unavailable: rate limited.`);
                  return;
                }

                noticeSegments.push(`${endpoint.label} models unavailable right now.`);
              }
            }),
          );

          const mergedModels = authEntries.flatMap(
            ([endpoint]) => modelsByEndpoint.get(endpoint.id) ?? [],
          );
          const availableIds = new Set(mergedModels.map((model) => model.id));
          // Tell the user when a family starts naming a new release, so the
          // model new chats start with never moves silently. Chats already
          // under way keep the model they started with.
          const families = CURATED_MODELS.filter((entry) => isDynamicModelId(entry.id));
          if (mergedModels.length > 0) {
            const previous = get().ui.dynamicDefaultResolutions ?? {};
            const next: Record<string, string> = { ...previous };
            for (const family of families) {
              const resolved = resolveDynamicModelId(family.id, mergedModels);
              if (!availableIds.has(resolved)) continue;
              next[family.id] = resolved;
              const prior = previous[family.id];
              if (prior && prior !== resolved) {
                const name = formatModelLabel({
                  model: findModelById(mergedModels, resolved),
                  fallbackId: resolved,
                });
                noticeSegments.push(
                  `${family.name} is now ${name}: new chats use it, chats under way keep theirs.`,
                );
              }
            }
            if (families.some((family) => previous[family.id] !== next[family.id])) {
              set((s) => ({ ui: { ...s.ui, dynamicDefaultResolutions: next } }));
            }
          }

          defaultModelAvailable = availableIds.has(
            resolveDynamicModelId(DEFAULT_MODEL_ID, mergedModels),
          );
          if (!defaultModelAvailable && mergedModels.length > 0 && !fallbackModelId) {
            const fallback =
              findModelById(mergedModels, resolveDefaultModelId(mergedModels)) ?? mergedModels[0];
            fallbackModelId = fallback.id;
            // Say so once per fallback, not on every load: the record keeps
            // the last one announced beside the alias resolutions.
            const announcedKey = `fallback:${DEFAULT_MODEL_ID}`;
            const resolutions = get().ui.dynamicDefaultResolutions ?? {};
            if (resolutions[announcedKey] !== fallback.id) {
              const fallbackLabel = formatModelLabel({ model: fallback, fallbackId: fallback.id });
              noticeSegments.push(
                `${DEFAULT_MODEL_NAME} is not offered by your providers, so new chats start with ${fallbackLabel}.`,
              );
              set((s) => ({
                ui: {
                  ...s.ui,
                  dynamicDefaultResolutions: {
                    ...(s.ui.dynamicDefaultResolutions ?? {}),
                    [announcedKey]: fallback.id,
                  },
                },
              }));
            }
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
              notify(get, noticeSegments.join(' '));
              return;
            }
            if (!get().ui.notice) {
              notify(get, NOTICE_MODELS_UNAVAILABLE);
            }
            return;
          }

          if (zdrOnly && zdrUnavailable && !(get().ui.notice || noticeSegments.length > 0)) {
            notify(get, ZDR_UNAVAILABLE_NOTICE);
          }

          if (noticeSegments.length > 0 || fallbackModelId) {
            set((s) => ({
              ui: (() => {
                const nextOverrides = readNextOverrides(s.ui);
                const modelOverride = nextOverrides.modelId ?? fallbackModelId;
                const updatedUi = modelOverride
                  ? applyNextOverrides(s.ui, { modelId: modelOverride })
                  : s.ui;
                return updatedUi;
              })(),
            }));
            if (noticeSegments.length > 0 && !get().ui.notice) {
              const message = noticeSegments.join(' ');
              notify(get, message);
            }
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
