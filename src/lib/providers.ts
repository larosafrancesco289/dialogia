import type { ModelDescriptor } from '@/lib/types';
import type { ProviderEndpoint, TransportKind } from '@/lib/transport/endpoints';
import { getDefaultEndpoint, resolveModelEndpoint } from '@/lib/transport/endpointRegistry';

export function getDefaultEndpointId(): string {
  return getDefaultEndpoint().id;
}

export function getModelEndpoint(model?: ModelDescriptor | null): ProviderEndpoint {
  if (!model) return getDefaultEndpoint();
  return resolveModelEndpoint(model.id, model);
}

export function resolveModelTransportKind(
  modelId?: string,
  model?: ModelDescriptor | null,
): TransportKind {
  return resolveModelEndpoint(modelId, model).kind;
}

export function getModelProviderLabel(model?: ModelDescriptor | null): string {
  if (model?.providerDisplay) return model.providerDisplay;
  return getModelEndpoint(model).label;
}

export function getTransportModelId(model?: ModelDescriptor | null): string | undefined {
  if (!model) return undefined;
  return model.transportModelId || model.id;
}
