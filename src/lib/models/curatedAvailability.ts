import type { CuratedModel } from '@/data/curatedModels';
import { toAnthropicModelId } from '@/lib/anthropic/shared';
import { resolveModelTransportKind } from '@/lib/providers';

export function isCuratedModelAvailable(
  model: Pick<CuratedModel, 'id'>,
  availableIds: ReadonlySet<string>,
): boolean {
  if (availableIds.has(model.id)) return true;
  if (resolveModelTransportKind(model.id) !== 'anthropic') return false;
  return availableIds.has(toAnthropicModelId(model.id));
}

export function filterCuratedModelsByAvailability<T extends Pick<CuratedModel, 'id'>>(
  models: readonly T[],
  availableIds: ReadonlySet<string>,
): T[] {
  return models.filter((model) => isCuratedModelAvailable(model, availableIds));
}
