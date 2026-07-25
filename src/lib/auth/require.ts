import { getKey } from '@/lib/keys/store';
import type { ModelIndex } from '@/lib/models';
import { buildTransportAuth, usesProxy, type TransportAuth } from '@/lib/auth/transport';
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

/** True when calls to this endpoint spend the deployment's key rather than the user's. */
export function isEndpointProxied(endpoint: ProviderEndpoint): boolean {
  return usesProxy({ endpoint, apiKey: getKey(endpoint.apiKeyRef) });
}

export function requireEndpointAuth(endpoint: ProviderEndpoint): TransportAuth {
  const apiKey = getKey(endpoint.apiKeyRef);
  if (!apiKey && endpoint.useProxy !== true && !allowsKeylessCalls(endpoint)) {
    throw missingProviderKey(endpoint);
  }
  return buildTransportAuth({ endpoint, apiKey });
}

export function requireModelAuth(modelId: string, modelIndex: ModelIndex): TransportAuth {
  const meta = modelIndex.get(modelId);
  return requireEndpointAuth(resolveModelEndpoint(modelId, meta));
}
