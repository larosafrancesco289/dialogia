import { anthropicTransport } from '@/lib/anthropic';
import { openrouterTransport } from '@/lib/openrouter';
import type { ModelTransport } from '@/lib/types';
import type { TransportClient } from '@/lib/transport/types';

const registry: Record<ModelTransport, TransportClient> = {
  anthropic: anthropicTransport,
  openrouter: openrouterTransport,
};

export function getTransportClient(transport?: ModelTransport): TransportClient {
  if (!transport) return registry.openrouter;
  return registry[transport] ?? registry.openrouter;
}

export function setTransportClient(transport: ModelTransport, client: TransportClient) {
  registry[transport] = client;
}

export function resetTransportRegistry() {
  registry.anthropic = anthropicTransport;
  registry.openrouter = openrouterTransport;
}
