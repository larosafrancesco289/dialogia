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

export function usesProxy(auth?: TransportAuth): boolean {
  return auth?.endpoint.useProxy === true;
}
