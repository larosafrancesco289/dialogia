export type ModelTransport = 'openrouter' | 'anthropic';

export type ModelDescriptor = {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: {
    prompt?: number;
    completion?: number;
    inputCacheRead?: number;
    inputCacheWrite?: number;
    image?: number;
    audio?: number;
    webSearch?: number;
    internalReasoning?: number;
    currency?: string;
  };
  raw?: unknown;
  // Transport/provider metadata for multi-provider routing.
  transport?: ModelTransport;
  transportModelId?: string;
  providerDisplay?: string;
};
