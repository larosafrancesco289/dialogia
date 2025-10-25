import type { ORModel, ModelTransport } from '@/lib/types';

export const DEFAULT_TRANSPORT: ModelTransport = 'openrouter';

const TRANSPORT_LABELS: Record<ModelTransport, string> = {
  openrouter: 'OpenRouter',
  anthropic: 'Anthropic',
};

export function getTransportLabel(transport?: ModelTransport): string {
  if (!transport) return TRANSPORT_LABELS[DEFAULT_TRANSPORT];
  return TRANSPORT_LABELS[transport] ?? TRANSPORT_LABELS[DEFAULT_TRANSPORT];
}

export function getModelTransport(model?: ORModel | null): ModelTransport {
  if (!model) return DEFAULT_TRANSPORT;
  return model.transport ?? DEFAULT_TRANSPORT;
}

const ANTHROPIC_ID_PATTERN = /^anthropic[:/#]/i;

export function resolveModelTransport(modelId?: string, model?: ORModel | null): ModelTransport {
  if (model?.transport) return model.transport;
  const haystack = modelId || model?.id || '';
  if (ANTHROPIC_ID_PATTERN.test(haystack)) return 'anthropic';
  return DEFAULT_TRANSPORT;
}

export function getModelTransportLabel(model?: ORModel | null): string {
  if (!model) return getTransportLabel();
  if (model.providerDisplay) return model.providerDisplay;
  return getTransportLabel(getModelTransport(model));
}

export function getTransportModelId(model?: ORModel | null): string | undefined {
  if (!model) return undefined;
  return model.transportModelId || model.id;
}
