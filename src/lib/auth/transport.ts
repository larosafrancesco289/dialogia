import type { ModelTransport } from '@/lib/types';

export type TransportAuth = {
  transport: ModelTransport;
  apiKey?: string;
  useProxy: boolean;
};

export function buildTransportAuth(opts: {
  transport: ModelTransport;
  apiKey?: string;
  useProxy?: boolean;
}): TransportAuth {
  return {
    transport: opts.transport,
    apiKey: opts.apiKey,
    useProxy: opts.useProxy ?? false,
  };
}
