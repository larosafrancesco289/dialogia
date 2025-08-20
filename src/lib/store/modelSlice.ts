import type { StoreState } from '@/lib/store/types';
import { fetchModels } from '@/lib/openrouter';
import { useOpenRouterProxy } from '@/lib/env';
import { PINNED_MODEL_ID } from '@/lib/constants';

export function createModelSlice(
  set: (fn: (s: StoreState) => Partial<StoreState> | void) => void,
  get: () => StoreState,
) {
  return {
    models: [] as StoreState['models'],
    favoriteModelIds: [] as StoreState['favoriteModelIds'],
    hiddenModelIds: [] as StoreState['hiddenModelIds'],

    async loadModels() {
      const useProxy = useOpenRouterProxy();
      const key = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY as string | undefined;
      if (!key && !useProxy)
        return set((s) => ({ ui: { ...s.ui, notice: 'Missing NEXT_PUBLIC_OPENROUTER_API_KEY in .env' } }));
      try {
        const models = await fetchModels(key || '');
        set({ models } as any);
      } catch (e: any) {
        if (e?.message === 'unauthorized') set((s) => ({ ui: { ...s.ui, notice: 'Invalid API key' } }));
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
        hiddenModelIds: s.hiddenModelIds.includes(id) ? s.hiddenModelIds : [id, ...s.hiddenModelIds],
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
