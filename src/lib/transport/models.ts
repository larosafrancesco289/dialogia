export type ModelTransport = 'openrouter';

export type ModelDescriptor = {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: number; completion?: number; currency?: string };
  raw?: unknown;
  // Transport/provider metadata for multi-provider routing.
  transport?: ModelTransport;
  transportModelId?: string;
  providerDisplay?: string;
};
