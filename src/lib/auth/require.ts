import { requireAnthropicClientKeyOrProxy, requireClientKeyOrProxy } from '@/lib/env/public';
import { resolveModelTransport } from '@/lib/providers';
import type { ModelIndex } from '@/lib/models';
import type { ModelTransport } from '@/lib/types';

export type TransportAuthStatus = {
  key?: string;
  useProxy: boolean;
};

export function requireTransportAuth(transport: ModelTransport): TransportAuthStatus {
  return transport === 'anthropic' ? requireAnthropicClientKeyOrProxy() : requireClientKeyOrProxy();
}

export function requireModelAuth(
  modelId: string,
  modelIndex: ModelIndex,
): { transport: ModelTransport; apiKey: string; useProxy: boolean } {
  const meta = modelIndex.get(modelId);
  const transport = resolveModelTransport(modelId, meta);
  try {
    const status = requireTransportAuth(transport);
    return {
      transport,
      apiKey: status.key ?? '',
      useProxy: status.useProxy,
    };
  } catch (error) {
    if (error && typeof error === 'object') {
      (error as Record<string, unknown>).transport = transport;
    }
    throw error;
  }
}
