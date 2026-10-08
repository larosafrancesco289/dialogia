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
    /** Prompts longer than `above` tokens bill their input at `multiplier` times the rates above. */
    longPrompt?: { above: number; multiplier: number };
  };
  raw?: unknown;
  /** Which configured endpoint serves this model; identity is (endpointId, transportModelId). */
  endpointId?: string;
  /** The id the endpoint's own API expects, when it differs from the app-side id. */
  transportModelId?: string;
  providerDisplay?: string;
};
