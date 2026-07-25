import { anthropicTransport } from '@/lib/anthropic';
import { openaiCompatTransport } from '@/lib/openaiCompat';
import { openrouterTransport } from '@/lib/openrouter';
import type { TransportKind } from '@/lib/transport/endpoints';
import type { TransportClient } from '@/lib/transport/types';

function defaults(): Record<TransportKind, TransportClient> {
  return {
    anthropic: anthropicTransport,
    openrouter: openrouterTransport,
    'openai-compatible': openaiCompatTransport,
  };
}

let registry: Record<TransportKind, TransportClient> = defaults();

export function getTransportClient(kind?: TransportKind): TransportClient {
  if (!kind) return registry.openrouter;
  return registry[kind] ?? registry.openrouter;
}

export function setTransportClient(kind: TransportKind, client: TransportClient) {
  registry[kind] = client;
}

export function resetTransportRegistry() {
  registry = defaults();
}
