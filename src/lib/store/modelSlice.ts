import type { StoreState } from '@/lib/store/types';
import { requireTransportAuth } from '@/lib/auth/require';
import { ZDR_UNAVAILABLE_NOTICE } from '@/lib/policy/zdr';
import { computeZdrFilterCached } from '@/lib/policy/zdr/cache';
import { PINNED_MODEL_ID, DEFAULT_MODEL_ID, DEFAULT_MODEL_NAME } from '@/lib/constants';
import { CURATED_MODELS } from '@/data/curatedModels';
import { createModelIndex, EMPTY_MODEL_INDEX, formatModelLabel } from '@/lib/models';
import { createStoreSlice } from '@/lib/store/createSlice';
import { API_ERROR_CODES, isApiError } from '@/lib/api/errors';
import { getTransportClient } from '@/lib/transport/registry';
import {
  NOTICE_INVALID_KEY,
  NOTICE_MISSING_CLIENT_KEY,
  NOTICE_MODELS_UNAVAILABLE,
} from '@/lib/store/notices';
import { applyNextOverrides, readNextOverrides } from '@/lib/ui/next';
import { notify } from '@/lib/store/notify';
import type { ModelTransport } from '@/lib/types';

const SUPPORTED_MODEL_TRANSPORTS: ModelTransport[] = ['openrouter', 'anthropic'];

function getModelTransportNoticeLabel(transport: ModelTransport): string {
  return transport === 'anthropic' ? 'Anthropic' : 'OpenRouter';
}

export const createModelSlice = createStoreSlice((set, get) => {
  let isLoadingModels = false;

  return {
    models: [] as StoreState['models'],
    favoriteModelIds: [] as StoreState['favoriteModelIds'],
    hiddenModelIds: [] as StoreState['hiddenModelIds'],
    modelIndex: EMPTY_MODEL_INDEX,

    async loadModels(_opts?: { showErrors?: boolean }) {
      if (isLoadingModels) return;
      const authEntries = SUPPORTED_MODEL_TRANSPORTS.flatMap((transport) => {
        try {
          return [[transport, requireTransportAuth(transport)] as const];
        } catch {
          return [];
        }
      });
      if (authEntries.length === 0) {
        notify(get, NOTICE_MISSING_CLIENT_KEY);
        return;
      }

      isLoadingModels = true;
      try {
        const zdrOnly = get().ui.zdrOnly === true;
        const modelsByTransport: Partial<Record<ModelTransport, StoreState['models']>> = {};
        const noticeSegments: string[] = [];
        let fallbackModelId: string | undefined;
        let defaultModelAvailable = false;

        let zdrUnavailable = false;
        let hadUnauthorizedFailure = false;

        await Promise.all(
          authEntries.map(async ([transport, auth]) => {
            if (transport === 'anthropic' && zdrOnly) {
              modelsByTransport[transport] = [];
              noticeSegments.push('Anthropic models are hidden while ZDR-only mode is enabled.');
              return;
            }

            try {
              const transportClient = getTransportClient(transport);
              let models = await transportClient.fetchModels(auth);

              if (transport === 'openrouter') {
                const { filter, filtered } = await computeZdrFilterCached(
                  models,
                  zdrOnly ? 'enforce' : 'informational',
                  set,
                  get,
                );
                if (zdrOnly) {
                  if (filter.status === 'unknown') {
                    zdrUnavailable = true;
                    models = [];
                  } else {
                    models = filtered;
                  }
                } else {
                  models = filtered;
                }
              }

              modelsByTransport[transport] = models;
            } catch (error: unknown) {
              modelsByTransport[transport] = [];
              if (isApiError(error) && error.code === API_ERROR_CODES.UNAUTHORIZED) {
                hadUnauthorizedFailure = true;
                noticeSegments.push(
                  `${getModelTransportNoticeLabel(transport)} models unavailable: invalid API key.`,
                );
                return;
              }

              if (isApiError(error) && error.code === API_ERROR_CODES.RATE_LIMITED) {
                noticeSegments.push(
                  `${getModelTransportNoticeLabel(transport)} models unavailable: rate limited.`,
                );
                return;
              }

              noticeSegments.push(
                `${getModelTransportNoticeLabel(transport)} models unavailable right now.`,
              );
            }
          }),
        );

        const mergedModels = SUPPORTED_MODEL_TRANSPORTS.flatMap(
          (transport) => modelsByTransport[transport] ?? [],
        );
        const availableIds = new Set(mergedModels.map((model) => model.id));
        const missingCurated = CURATED_MODELS.filter((entry) => !availableIds.has(entry.id));
        if (missingCurated.length > 0) {
          noticeSegments.push(
            `Unavailable curated models: ${missingCurated
              .map((entry) => entry.name || entry.id)
              .join(', ')}`,
          );
        }

        defaultModelAvailable = availableIds.has(DEFAULT_MODEL_ID);
        if (!defaultModelAvailable && mergedModels.length > 0 && !fallbackModelId) {
          const fallback = mergedModels[0];
          fallbackModelId = fallback.id;
          const fallbackLabel = formatModelLabel({ model: fallback, fallbackId: fallback.id });
          noticeSegments.push(
            `Default model ${DEFAULT_MODEL_NAME} unavailable. Using ${fallbackLabel}.`,
          );
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
