// Module: hooks/useModelCatalog
// Responsibility: The model lists the UI offers, narrowed to endpoints that
// still exist. Every model is available to every user, because every call is
// paid for with the user's own key.

import { useMemo } from 'react';
import { useChatStore } from '@/lib/store';
import { CURATED_MODELS } from '@/data/curatedModels';
import { DEFAULT_MODEL_ID } from '@/lib/constants';
import { filterCuratedModelsByAvailability } from '@/lib/models/curatedAvailability';
import { findModelById, isDynamicModelId, resolveDynamicModelId } from '@/lib/models';
import { hasAnyEndpoint, isModelEndpointAvailable } from '@/lib/policy/providerAvailability';

/** Every loaded model whose endpoint is still configured. */
export function useAvailableModels() {
  const allModels = useChatStore((s) => s.models);
  return useMemo(() => allModels.filter((model) => isModelEndpointAvailable(model)), [allModels]);
}

/**
 * The curated picks, with dynamic aliases resolved to the concrete model they
 * currently name so "latest" is never a mystery.
 */
export function useCuratedModels() {
  const allModels = useChatStore((s) => s.models);

  return useMemo(() => {
    if (!hasAnyEndpoint()) return [];
    const availableIds = new Set((allModels || []).map((model) => model.id));
    if (availableIds.size === 0) return [];
    const resolved = CURATED_MODELS.map((entry) => {
      if (!isDynamicModelId(entry.id)) return entry;
      const concreteId = resolveDynamicModelId(entry.id, allModels || []);
      const concrete = findModelById(allModels || [], concreteId);
      const currentName = concrete?.name || concreteId;
      return {
        ...entry,
        id: concreteId,
        description: `${entry.description}. Currently: ${currentName}`,
      };
    });
    return filterCuratedModelsByAvailability(resolved, availableIds);
  }, [allModels]);
}

/** The concrete model a new chat starts with. */
export function useDefaultModelId() {
  const allModels = useChatStore((s) => s.models);
  return useMemo(() => resolveDynamicModelId(DEFAULT_MODEL_ID, allModels || []), [allModels]);
}
