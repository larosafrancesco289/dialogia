import type { StoreState } from '@/lib/store/types';
import { fetchModels as fetchOpenRouterModels } from '@/lib/openrouter';
import { requireClientKeyOrProxy } from '@/lib/env/public';
import { ZDR_UNAVAILABLE_NOTICE } from '@/lib/policy/zdr';
import { computeZdrFilterCached } from '@/lib/policy/zdr/cache';
import { PINNED_MODEL_ID, DEFAULT_MODEL_ID, DEFAULT_MODEL_NAME } from '@/lib/constants';
import { CURATED_MODELS } from '@/data/curatedModels';
import { createModelIndex, EMPTY_MODEL_INDEX, formatModelLabel } from '@/lib/models';
import { createStoreSlice } from '@/lib/store/createSlice';
import { API_ERROR_CODES, isApiError } from '@/lib/api/errors';
import {
  NOTICE_INVALID_KEY,
  NOTICE_MISSING_CLIENT_KEY,
  NOTICE_MODELS_UNAVAILABLE,
} from '@/lib/store/notices';
import { applyNextOverrides, readNextOverrides } from '@/lib/ui/next';

export const createModelSlice = createStoreSlice((set, get) => {
  let isLoadingModels = false;

  return {
    models: [] as StoreState['models'],
    favoriteModelIds: [] as StoreState['favoriteModelIds'],
    hiddenModelIds: [] as StoreState['hiddenModelIds'],
    modelIndex: EMPTY_MODEL_INDEX,

    async loadModels(_opts?: { showErrors?: boolean }) {
      if (isLoadingModels) return;
      let openrouterStatus: { key?: string; useProxy: boolean } | null = null;
      try {
        openrouterStatus = requireClientKeyOrProxy();
      } catch {
        openrouterStatus = null;
      }
      if (!openrouterStatus) {
        const setNotice = get().setNotice;
        if (typeof setNotice === 'function') {
          setNotice(NOTICE_MISSING_CLIENT_KEY);
        } else {
          set((s) => ({
            ui: { ...s.ui, notice: NOTICE_MISSING_CLIENT_KEY },
          }));
        }
        return;
      }
      isLoadingModels = true;
      try {
        const zdrOnly = get().ui.zdrOnly === true;
        let openrouterModels: StoreState['models'] = [];
        const noticeSegments: string[] = [];
        let fallbackModelId: string | undefined;
        let defaultModelAvailable = false;
        try {
          openrouterModels = await fetchOpenRouterModels(openrouterStatus.key || '');
          const availableIds = new Set(openrouterModels.map((model) => model.id));
          const missingCurated = CURATED_MODELS.filter((entry) => !availableIds.has(entry.id));
          if (missingCurated.length > 0) {
            noticeSegments.push(
              `Unavailable curated models: ${missingCurated
                .map((entry) => entry.name || entry.id)
                .join(', ')}`,
            );
          }

          defaultModelAvailable = availableIds.has(DEFAULT_MODEL_ID);
          if (!defaultModelAvailable && openrouterModels.length > 0 && !fallbackModelId) {
            const fallback = openrouterModels[0];
            fallbackModelId = fallback.id;
            const fallbackLabel = formatModelLabel({ model: fallback, fallbackId: fallback.id });
            noticeSegments.push(
              `Default model ${DEFAULT_MODEL_NAME} unavailable. Using ${fallbackLabel}.`,
            );
          }

          const { filter, filtered } = await computeZdrFilterCached(
            openrouterModels,
            zdrOnly ? 'enforce' : 'informational',
            set,
            get,
          );
          if (zdrOnly) {
            if (filter.status === 'unknown') {
              openrouterModels = [];
              const setNotice = get().setNotice;
              if (typeof setNotice === 'function') {
                setNotice(ZDR_UNAVAILABLE_NOTICE);
              } else {
                set((s) => ({ ui: { ...s.ui, notice: ZDR_UNAVAILABLE_NOTICE } }));
              }
            } else {
              openrouterModels = filtered;
            }
          } else {
            openrouterModels = filtered;
          }
        } catch (error: unknown) {
          openrouterModels = [];
          if (isApiError(error) && error.code === API_ERROR_CODES.UNAUTHORIZED) {
            const setNotice = get().setNotice;
            if (typeof setNotice === 'function') {
              setNotice(NOTICE_INVALID_KEY);
            } else {
              set((s) => ({ ui: { ...s.ui, notice: NOTICE_INVALID_KEY } }));
            }
          }
        }

        if (openrouterModels.length === 0) {
          if (!get().ui.notice) {
            const setNotice = get().setNotice;
            if (typeof setNotice === 'function') {
              setNotice(NOTICE_MODELS_UNAVAILABLE);
            } else {
              set((s) => ({
                ui: {
                  ...s.ui,
                  notice: NOTICE_MODELS_UNAVAILABLE,
                },
              }));
            }
          }
          return;
        }
        if (noticeSegments.length > 0 || fallbackModelId) {
          set((s) => ({
            ui: (() => {
              const nextOverrides = readNextOverrides(s.ui);
              const modelOverride = nextOverrides.model ?? fallbackModelId;
              const updatedUi = modelOverride
                ? applyNextOverrides(s.ui, { model: modelOverride })
                : s.ui;
              return updatedUi;
            })(),
          }));
          if (noticeSegments.length > 0 && !get().ui.notice) {
            const setNotice = get().setNotice;
            const message = noticeSegments.join(' ');
            if (typeof setNotice === 'function') {
              setNotice(message);
            } else {
              set((s) => ({
                ui: {
                  ...s.ui,
                  notice: message,
                },
              }));
            }
          }
        }
        set({ models: openrouterModels, modelIndex: createModelIndex(openrouterModels) });
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
      if (id === PINNED_MODEL_ID) return;
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
      if (id === PINNED_MODEL_ID) return;
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
});
