import { requireClientKeyOrProxy } from '@/lib/env/public';
import { resolveModelTransport } from '@/lib/providers';
import type { ModelIndex } from '@/lib/models';
import type { ModelTransport } from '@/lib/types';
import { buildTransportAuth, type TransportAuth } from '@/lib/auth/transport';

export function requireTransportAuth(transport: ModelTransport): TransportAuth {
  switch (transport) {
    case 'openrouter': {
      const status = requireClientKeyOrProxy('openrouter');
      return buildTransportAuth({
        transport,
        apiKey: status.key,
        useProxy: status.useProxy,
      });
    }
    case 'anthropic': {
      const status = requireClientKeyOrProxy('anthropic');
      return buildTransportAuth({
        transport,
        apiKey: status.key,
        useProxy: status.useProxy,
      });
    }
    default: {
      const status = requireClientKeyOrProxy(transport);
      return buildTransportAuth({
        transport,
        apiKey: status.key,
        useProxy: status.useProxy,
      });
    }
  }
}

export function requireModelAuth(modelId: string, modelIndex: ModelIndex): TransportAuth {
  const meta = modelIndex.get(modelId);
  const transport = resolveModelTransport(modelId, meta);
  try {
    const auth = requireTransportAuth(transport);
    return { ...auth, transport };
  } catch (error) {
    if (error && typeof error === 'object') {
      (error as Record<string, unknown>).transport = transport;
    }
    throw error;
  }
}
