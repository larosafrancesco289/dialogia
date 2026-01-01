import type { ModelDescriptor, ModelTransport } from '@/lib/types';

export const DEFAULT_TRANSPORT: ModelTransport = 'openrouter';

const TRANSPORT_LABELS: Record<ModelTransport, string> = {
  openrouter: 'OpenRouter',
};

export function getTransportLabel(transport?: ModelTransport): string {
  if (!transport) return TRANSPORT_LABELS[DEFAULT_TRANSPORT];
  return TRANSPORT_LABELS[transport] ?? TRANSPORT_LABELS[DEFAULT_TRANSPORT];
}

export function getModelTransport(model?: ModelDescriptor | null): ModelTransport {
  if (!model) return DEFAULT_TRANSPORT;
  return model.transport ?? DEFAULT_TRANSPORT;
}

export function resolveModelTransport(
  _modelId?: string,
  model?: ModelDescriptor | null,
): ModelTransport {
  if (model?.transport) return model.transport;
  return DEFAULT_TRANSPORT;
}

export function getModelTransportLabel(model?: ModelDescriptor | null): string {
  if (!model) return getTransportLabel();
  if (model.providerDisplay) return model.providerDisplay;
  return getTransportLabel(getModelTransport(model));
}

export function getTransportModelId(model?: ModelDescriptor | null): string | undefined {
  if (!model) return undefined;
  return model.transportModelId || model.id;
}
