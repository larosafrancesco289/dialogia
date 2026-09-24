// Module: hooks/useModelCatalog
// Responsibility: The model lists the UI offers, narrowed to endpoints that
// still exist. Every model is available to every user, because every call is
// paid for with the user's own key.

import { useMemo } from 'react';
import { useChatStore } from '@/lib/store';
import { CURATED_MODELS } from '@/data/curatedModels';
import { filterCuratedModelsByAvailability } from '@/lib/models/curatedAvailability';
import {
  aliasTargetOf,
  findModelById,
  formatModelLabel,
  isDynamicModelId,
  resolveDefaultModelId,
  resolveDynamicModelId,
} from '@/lib/models';
import { hasAnyEndpoint, isModelEndpointAvailable } from '@/lib/policy/providerAvailability';

/**
 * Every loaded model whose endpoint is still configured. A provider's own
 * alias entries ("GPT Sol Latest") are left out: the curated families stand
 * for them, and a chat names the concrete model anyway.
 */
export function useAvailableModels() {
  const allModels = useChatStore((s) => s.models);
  return useMemo(
    () => allModels.filter((model) => isModelEndpointAvailable(model) && !aliasTargetOf(model)),
    [allModels],
  );
}

/**
 * The curated picks, with families resolved to the concrete model they
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
      const currentName = formatModelLabel({ model: concrete, fallbackId: concreteId });
      return {
        ...entry,
        id: concreteId,
        // What it names today leads: a long description is cut at the end.
        description: `${currentName} · ${entry.description}`,
      };
    });
    // A family can resolve to a model that is also listed by name; the list
    // shows it once, under its first entry.
    const seen = new Set<string>();
    const unique = resolved.filter((entry) => !seen.has(entry.id) && !!seen.add(entry.id));
    return filterCuratedModelsByAvailability(unique, availableIds);
  }, [allModels]);
}

/** The concrete model a new chat starts with. */
export function useDefaultModelId() {
  const allModels = useChatStore((s) => s.models);
  return useMemo(() => resolveDefaultModelId(allModels || []), [allModels]);
}
