import type { ModelDescriptor } from '@/lib/types';
import {
  EMPTY_MODEL_CAPABILITIES,
  getModelCapabilities,
  type ModelCapabilityFlags,
} from '@/lib/models/capabilities';
import { formatModelLabel } from '@/lib/models/labels';

export type ModelIndex = {
  all: ModelDescriptor[];
  byId: Map<string, ModelDescriptor>;
  get: (id?: string) => ModelDescriptor | undefined;
  caps: (id?: string) => ModelCapabilityFlags;
  label: (id?: string, fallbackName?: string) => string;
};

export function findModelById(
  models: ModelDescriptor[] | undefined,
  id?: string,
): ModelDescriptor | undefined {
  if (!models || !id) return undefined;
  return models.find((m) => m.id === id);
}

export function createModelIndex(models: ModelDescriptor[] | undefined): ModelIndex {
  const list = Array.isArray(models) ? models.slice() : [];
  const byId = new Map<string, ModelDescriptor>();
  const capsCache = new Map<string, ModelCapabilityFlags>();
  for (const model of list) {
    if (!model?.id) continue;
    byId.set(model.id, model);
  }

  const get = (id?: string) => {
    if (!id) return undefined;
    return byId.get(id);
  };

  const caps = (id?: string): ModelCapabilityFlags => {
    if (!id) return EMPTY_MODEL_CAPABILITIES;
    if (capsCache.has(id)) return capsCache.get(id)!;
    const model = get(id);
    const computed = getModelCapabilities(model);
    capsCache.set(id, computed);
    return computed;
  };

  const label = (id?: string, fallbackName?: string) => {
    const model = get(id);
    return formatModelLabel({ model, fallbackId: id, fallbackName });
  };

  return {
    all: list,
    byId,
    get,
    caps,
    label,
  } satisfies ModelIndex;
}

export const EMPTY_MODEL_INDEX: ModelIndex = (() => {
  const byId = new Map<string, ModelDescriptor>();
  return {
    all: [],
    byId,
    get: () => undefined,
    caps: () => EMPTY_MODEL_CAPABILITIES,
    label: (id?: string, fallbackName?: string) =>
      formatModelLabel({ model: undefined, fallbackId: id, fallbackName }),
  } satisfies ModelIndex;
})();

export { formatModelLabel, stripProviderPrefix } from '@/lib/models/labels';
export {
  getModelCapabilities,
  getSupportedParameters,
  isAudioInputSupported,
  isImageOutputSupported,
  isReasoningSupported,
  isToolCallingSupported,
  isVisionSupported,
  supportsXhighReasoningEffort,
  type ModelCapabilityFlags,
} from '@/lib/models/capabilities';
