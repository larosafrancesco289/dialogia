// Module: models/defaultResolutions
// Responsibility: After a model load, record where each curated family resolves
// and announce the model new chats fall back to, with a notice for each that moved.

import { CURATED_MODELS } from '@/data/curatedModels';
import { DEFAULT_MODEL_ID } from '@/lib/constants';
import { findModelById } from '@/lib/models';
import { resolveDefaultModelId } from '@/lib/models/defaultModels';
import { isDynamicModelId, resolveDynamicModelId } from '@/lib/models/dynamicDefaults';
import { formatModelLabel } from '@/lib/models/labels';
import type { ModelDescriptor } from '@/lib/types';
import { t } from '@/lib/i18n';

type Resolutions = Record<string, string>;

type ModelDefaultsUpdate = {
  /** The record to save, when it differs from `previous`. */
  resolutions?: Resolutions;
  notices: string[];
};

/**
 * Tells the user when a family starts naming a new release, so the model new
 * chats start with never moves silently; chats already under way keep the
 * model they started with. A fallback for an unserved default is announced
 * once, not on every load: `previous` keeps the last one announced beside the
 * family resolutions. The first load records it quietly: whoever just connected
 * never chose the default it replaces.
 */
export function reconcileModelDefaults(
  models: ModelDescriptor[],
  previous: Resolutions,
): ModelDefaultsUpdate {
  if (models.length === 0) return { notices: [] };
  const availableIds = new Set(models.map((model) => model.id));
  const next: Resolutions = { ...previous };
  const notices: string[] = [];

  for (const family of CURATED_MODELS) {
    if (!isDynamicModelId(family.id)) continue;
    const resolved = resolveDynamicModelId(family.id, models);
    if (!availableIds.has(resolved)) continue;
    next[family.id] = resolved;
    const prior = previous[family.id];
    if (prior && prior !== resolved) {
      const name = formatModelLabel({
        model: findModelById(models, resolved),
        fallbackId: resolved,
      });
      notices.push(t('models.familyMoved', { family: family.name, model: name }));
    }
  }

  const defaultId = resolveDynamicModelId(DEFAULT_MODEL_ID, models);
  if (!availableIds.has(defaultId)) {
    const fallback = findModelById(models, resolveDefaultModelId(models)) ?? models[0];
    const announcedKey = `fallback:${DEFAULT_MODEL_ID}`;
    if (next[announcedKey] !== fallback.id && Object.keys(previous).length > 0) {
      // Named as the picker names it before a list carries it.
      const defaultLabel = formatModelLabel({ fallbackId: defaultId });
      const fallbackLabel = formatModelLabel({ model: fallback, fallbackId: fallback.id });
      notices.push(t('models.defaultMissing', { model: defaultLabel, fallback: fallbackLabel }));
    }
    next[announcedKey] = fallback.id;
  }

  const changed = Object.keys(next).some((key) => next[key] !== previous[key]);
  return { ...(changed ? { resolutions: next } : {}), notices };
}
