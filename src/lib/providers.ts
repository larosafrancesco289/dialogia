import type { ModelDescriptor } from '@/lib/types';
import type { ProviderEndpoint, TransportKind } from '@/lib/transport/endpoints';
import { findModelEndpoint, getDefaultEndpoint } from '@/lib/transport/endpointRegistry';

export function getDefaultEndpointId(): string {
  return getDefaultEndpoint().id;
}

/**
 * Labels and body-shape decisions, which render for stale model lists too, so a
 * model whose endpoint is gone degrades instead of throwing. The request path
 * uses `requireModelAuth`, which refuses that model outright.
 */
export function getModelEndpoint(model?: ModelDescriptor | null): ProviderEndpoint {
  if (!model) return getDefaultEndpoint();
  return findModelEndpoint(model.id, model) ?? getDefaultEndpoint();
}

export function resolveModelTransportKind(
  modelId?: string,
  model?: ModelDescriptor | null,
): TransportKind {
  return (findModelEndpoint(modelId, model) ?? getDefaultEndpoint()).kind;
}

export function getModelProviderLabel(model?: ModelDescriptor | null): string {
  if (model?.providerDisplay) return model.providerDisplay;
  return getModelEndpoint(model).label;
}

export function getTransportModelId(model?: ModelDescriptor | null): string | undefined {
  if (!model) return undefined;
  return model.transportModelId || model.id;
}
