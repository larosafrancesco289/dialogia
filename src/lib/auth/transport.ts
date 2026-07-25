import type { ProviderEndpoint } from '@/lib/transport/endpoints';

export type TransportAuth = {
  endpoint: ProviderEndpoint;
  /** Resolved from the key store at request time; absent when proxying. */
  apiKey?: string;
};

export function buildTransportAuth(opts: {
  endpoint: ProviderEndpoint;
  apiKey?: string;
}): TransportAuth {
  return { endpoint: opts.endpoint, apiKey: opts.apiKey };
}

/**
 * A key the user supplied wins over the deployment's proxy. BYOK is the
 * primary mode: someone who pastes their own key expects it to be the one
 * spending, and the hosted proxy stays the fallback for everyone else.
 */
export function usesProxy(auth?: TransportAuth): boolean {
  return auth?.endpoint.useProxy === true && !auth.apiKey;
}
