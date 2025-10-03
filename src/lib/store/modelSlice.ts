import type { StoreState } from '@/lib/store/types';
import { fetchModels } from '@/lib/openrouter';
import { getPublicOpenRouterKey, isOpenRouterProxyEnabled } from '@/lib/config';
import { ensureZdrLists, filterZdrModels, toZdrState, ZDR_UNAVAILABLE_NOTICE } from '@/lib/zdr';
import { PINNED_MODEL_ID, DEFAULT_MODEL_ID, DEFAULT_MODEL_NAME } from '@/lib/constants';
import { CURATED_MODELS } from '@/data/curatedModels';
import { formatModelLabel } from '@/lib/models';

export function createModelSlice(
  set: (fn: (s: StoreState) => Partial<StoreState> | void) => void,
  get: () => StoreState,
) {
  return {
    models: [] as StoreState['models'],
    favoriteModelIds: [] as StoreState['favoriteModelIds'],
    hiddenModelIds: [] as StoreState['hiddenModelIds'],

    async loadModels() {
      const useProxy = isOpenRouterProxyEnabled();
      const key = getPublicOpenRouterKey();
      if (!key && !useProxy)
        return set((s) => ({
          ui: { ...s.ui, notice: 'Missing NEXT_PUBLIC_OPENROUTER_API_KEY in .env' },
        }));
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
        const lists = await ensureZdrLists({
          modelIds: get().zdrModelIds,
          providerIds: get().zdrProviderIds,
        });
        set(toZdrState(lists) as any);
        if (get().ui.zdrOnly === true) {
          const filtered = filterZdrModels(models, lists);
          if (filtered.status === 'unknown') {
            models = [];
            set((s) => ({
              ui: { ...s.ui, notice: ZDR_UNAVAILABLE_NOTICE },
            }));
          } else {
            models = filtered.models;
          }
        }
        set({ models } as any);
      } catch (e: any) {
        if (e?.message === 'unauthorized')
          set((s) => ({ ui: { ...s.ui, notice: 'Invalid API key' } }));
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
      set({ hiddenModelIds: [] } as any);
    },

    removeModelFromDropdown(id: string) {
      if (id === PINNED_MODEL_ID) return;
      set((s) => {
        const isFavorite = s.favoriteModelIds.includes(id);
        if (isFavorite) {
          return { favoriteModelIds: s.favoriteModelIds.filter((m) => m !== id) } as any;
        }
        if (s.hiddenModelIds.includes(id)) return {} as any;
        return { hiddenModelIds: [id, ...s.hiddenModelIds] } as any;
      });
    },
  } satisfies Partial<StoreState>;
}
