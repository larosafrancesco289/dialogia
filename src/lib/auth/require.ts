import { getKey, isKeyRejected } from '@/lib/keys/store';
import type { ModelIndex } from '@/lib/models';
import { buildTransportAuth, type TransportAuth } from '@/lib/auth/transport';
import { allowsKeylessCalls, type ProviderEndpoint } from '@/lib/transport/endpoints';
import { resolveModelEndpoint } from '@/lib/transport/endpointRegistry';

export const MISSING_PROVIDER_KEY = 'missing_provider_key';

export type MissingProviderKeyError = Error & {
  code: typeof MISSING_PROVIDER_KEY;
  endpointId: string;
  endpointLabel: string;
};

function missingProviderKey(endpoint: ProviderEndpoint): MissingProviderKeyError {
  const error = new Error(MISSING_PROVIDER_KEY) as MissingProviderKeyError;
  error.code = MISSING_PROVIDER_KEY;
  error.endpointId = endpoint.id;
  error.endpointLabel = endpoint.label;
  return error;
}

/** The endpoint can be called: it holds a key, or it is a server that takes none. */
export function isEndpointConnected(endpoint: ProviderEndpoint): boolean {
  return !!getKey(endpoint.apiKeyRef) || allowsKeylessCalls(endpoint);
}

/**
 * The endpoint has a model to offer: a key it has not refused, or a keyless
 * server with at least one model, typed or listed. A server that answers with
 * none can be called but offers nothing to chat with.
 */
export function isEndpointUsable(
  endpoint: ProviderEndpoint,
  models: readonly { endpointId?: string }[],
): boolean {
  if (getKey(endpoint.apiKeyRef)) return !isKeyRejected(endpoint.apiKeyRef);
  if (!allowsKeylessCalls(endpoint)) return false;
  return !!endpoint.modelIds?.length || models.some((model) => model.endpointId === endpoint.id);
}

export function requireEndpointAuth(endpoint: ProviderEndpoint): TransportAuth {
  if (!isEndpointConnected(endpoint)) throw missingProviderKey(endpoint);
  return buildTransportAuth({ endpoint, apiKey: getKey(endpoint.apiKeyRef) });
}

export function requireModelAuth(modelId: string, modelIndex: ModelIndex): TransportAuth {
  const meta = modelIndex.get(modelId);
  return requireEndpointAuth(resolveModelEndpoint(modelId, meta));
}
