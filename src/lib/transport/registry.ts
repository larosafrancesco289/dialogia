import { anthropicTransport } from '@/lib/anthropic';
import { openaiCompatTransport } from '@/lib/openaiCompat';
import { openrouterTransport } from '@/lib/openrouter';
import type { TransportKind } from '@/lib/transport/endpoints';
import type { TransportClient } from '@/lib/transport/types';

const registry: Record<TransportKind, TransportClient> = {
  anthropic: anthropicTransport,
  openrouter: openrouterTransport,
  'openai-compatible': openaiCompatTransport,
};

export function getTransportClient(kind?: TransportKind): TransportClient {
  if (!kind) return registry.openrouter;
  return registry[kind] ?? registry.openrouter;
}
