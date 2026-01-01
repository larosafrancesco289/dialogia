import type { ModelDescriptor, ModelTransport } from '@/lib/types';
import { getModelTransport } from '@/lib/providers';

export const TRANSPORT_AVAILABILITY: Record<ModelTransport, boolean> = {
  openrouter: true,
};

export function isTransportAvailable(transport?: ModelTransport): boolean {
  if (!transport) return true;
  return TRANSPORT_AVAILABILITY[transport] ?? false;
}

export function isModelTransportAvailable(model?: ModelDescriptor | null): boolean {
  if (!model) return true;
  return isTransportAvailable(getModelTransport(model));
}
