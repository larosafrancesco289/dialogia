import type { StoreState } from '@/lib/store/types';
import { fetchModels } from '@/lib/openrouter';
import { getPublicOpenRouterKey, isOpenRouterProxyEnabled } from '@/lib/config';
import { ensureListsAndFilter } from '@/lib/zdr/enforce';
import { ZDR_UNAVAILABLE_NOTICE } from '@/lib/zdr';
import { PINNED_MODEL_ID, DEFAULT_MODEL_ID, DEFAULT_MODEL_NAME } from '@/lib/constants';
import { CURATED_MODELS } from '@/data/curatedModels';
import { createModelIndex, EMPTY_MODEL_INDEX, formatModelLabel } from '@/lib/models';
import { createStoreSlice } from '@/lib/store/createSlice';

export const createModelSlice = createStoreSlice((set, get) => {
  let isLoadingModels = false;

  return {
    models: [] as StoreState['models'],
    favoriteModelIds: [] as StoreState['favoriteModelIds'],
    hiddenModelIds: [] as StoreState['hiddenModelIds'],
    modelIndex: EMPTY_MODEL_INDEX,

    async loadModels(_opts?: { showErrors?: boolean }) {
      if (isLoadingModels) return;
      const useProxy = isOpenRouterProxyEnabled();
      const key = getPublicOpenRouterKey();
      if (!key && !useProxy) {
        set((s) => ({
          ui: { ...s.ui, notice: 'Missing NEXT_PUBLIC_OPENROUTER_API_KEY' },
        }));
        return;
      }
      isLoadingModels = true;
      try {
        let models = await fetchModels(key || '');
        const availableIds = new Set(models.map((model) => model.id));
        const missingCurated = CURATED_MODELS.filter((entry) => !availableIds.has(entry.id));
        let fallbackModelId: string | undefined;
        let noticeSegments: string[] = [];

        if (missingCurated.length > 0) {
          noticeSegments.push(
            `Unavailable curated models: ${missingCurated
              .map((entry) => entry.name || entry.id)
              .join(', ')}`,
          );
        }

        if (!availableIds.has(DEFAULT_MODEL_ID) && models.length > 0) {
          const fallback = models[0];
          fallbackModelId = fallback.id;
          const fallbackLabel = formatModelLabel({ model: fallback, fallbackId: fallback.id });
          noticeSegments.push(
            `Default model ${DEFAULT_MODEL_NAME} unavailable. Using ${fallbackLabel}.`,
          );
        }

        if (noticeSegments.length > 0) {
          set((s) => ({
            ui: {
              ...s.ui,
              nextModel: s.ui.nextModel ?? fallbackModelId ?? s.ui.nextModel,
              notice: s.ui.notice ?? noticeSegments.join(' '),
            },
          }));
        }
        const zdrOnly = get().ui.zdrOnly === true;
        const { lists, filter, filtered } = await ensureListsAndFilter(
          models,
          zdrOnly ? 'enforce' : 'informational',
          {
            modelIds: get().zdrModelIds,
            providerIds: get().zdrProviderIds,
          },
        );
        set(() => ({
          zdrModelIds: Array.from(lists.modelIds),
          zdrProviderIds: Array.from(lists.providerIds),
        }));
        if (zdrOnly) {
          if (filter.status === 'unknown') {
            models = [];
            set((s) => ({ ui: { ...s.ui, notice: ZDR_UNAVAILABLE_NOTICE } }));
          } else {
            models = filtered;
          }
        }
        set({ models, modelIndex: createModelIndex(models) });
      } catch (e: any) {
        if (e?.message === 'unauthorized')
          set((s) => ({ ui: { ...s.ui, notice: 'Invalid API key' } }));
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
