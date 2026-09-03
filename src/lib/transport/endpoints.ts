// Module: transport/endpoints
// Responsibility: Describe where a model call goes. A closed set of transport
// *implementations* (`TransportKind`) carries an open set of user-configured
// *endpoints* (`ProviderEndpoint`), so adding an OpenAI-compatible server is
// configuration rather than code.

export type TransportKind = 'openrouter' | 'anthropic' | 'openai-compatible';

export type EndpointCapabilities = {
  tools?: boolean;
  vision?: boolean;
  /** Emit reasoning/effort parameters. */
  reasoning?: boolean;
  /** Ask for usage on the final stream chunk (`stream_options.include_usage`). */
  streamUsage?: boolean;
  parallelToolCalls?: boolean;
  /** Emit `cache_control` blocks. */
  promptCaching?: boolean;
};

export type ProviderEndpoint = {
  id: string;
  kind: TransportKind;
  label: string;
  /** Required for `openai-compatible`; the built-ins carry their own defaults. */
  baseUrl?: string;
  /** Reference into the key store — never the key itself. */
  apiKeyRef?: string;
  /**
   * Explicit for user-added endpoints: an unlisted capability is never emitted.
   * The built-ins carry metadata-rich model lists instead and leave this unset.
   */
  capabilities?: EndpointCapabilities;
  /** Model ids the user typed for this endpoint (openai-compatible only). */
  modelIds?: string[];
  /** Model used for chat titles; falls back to the chat model when unset. */
  titleModelId?: string;
  /** Never generate titles through this endpoint. */
  disableTitleGeneration?: boolean;
};

export const OPENROUTER_ENDPOINT_ID = 'openrouter';
export const ANTHROPIC_ENDPOINT_ID = 'anthropic';

/** Key-store references for the two built-ins. */
export const OPENROUTER_KEY_REF = 'openrouter';
export const ANTHROPIC_KEY_REF = 'anthropic';

export const OPENROUTER_ENDPOINT: ProviderEndpoint = Object.freeze({
  id: OPENROUTER_ENDPOINT_ID,
  kind: 'openrouter',
  label: 'OpenRouter',
  apiKeyRef: OPENROUTER_KEY_REF,
});

export const ANTHROPIC_ENDPOINT: ProviderEndpoint = Object.freeze({
  id: ANTHROPIC_ENDPOINT_ID,
  kind: 'anthropic',
  label: 'Anthropic',
  apiKeyRef: ANTHROPIC_KEY_REF,
});

/** Always present, never deletable. */
export const BUILT_IN_ENDPOINTS: ProviderEndpoint[] = [OPENROUTER_ENDPOINT, ANTHROPIC_ENDPOINT];

export const DEFAULT_ENDPOINT_ID = OPENROUTER_ENDPOINT_ID;

export function isBuiltInEndpointId(id: string): boolean {
  return id === OPENROUTER_ENDPOINT_ID || id === ANTHROPIC_ENDPOINT_ID;
}

export function getBuiltInEndpoint(id: string): ProviderEndpoint | undefined {
  return BUILT_IN_ENDPOINTS.find((endpoint) => endpoint.id === id);
}

/**
 * What a transport may emit when the endpoint says nothing. The built-ins are
 * fully featured; a user-configured OpenAI-compatible server gets the minimal
 * body until it is told otherwise.
 */
const DEFAULT_CAPABILITIES: Record<TransportKind, Required<EndpointCapabilities>> = {
  openrouter: {
    tools: true,
    vision: true,
    reasoning: true,
    streamUsage: true,
    parallelToolCalls: true,
    promptCaching: true,
  },
  anthropic: {
    tools: true,
    vision: true,
    reasoning: true,
    streamUsage: true,
    parallelToolCalls: false,
    promptCaching: true,
  },
  'openai-compatible': {
    tools: false,
    vision: false,
    reasoning: false,
    streamUsage: false,
    parallelToolCalls: false,
    promptCaching: false,
  },
};

export function endpointCapabilities(endpoint: ProviderEndpoint): Required<EndpointCapabilities> {
  const defaults = DEFAULT_CAPABILITIES[endpoint.kind] ?? DEFAULT_CAPABILITIES['openai-compatible'];
  const explicit = endpoint.capabilities;
  if (!explicit) return defaults;
  return {
    tools: explicit.tools ?? defaults.tools,
    vision: explicit.vision ?? defaults.vision,
    reasoning: explicit.reasoning ?? defaults.reasoning,
    streamUsage: explicit.streamUsage ?? defaults.streamUsage,
    parallelToolCalls: explicit.parallelToolCalls ?? defaults.parallelToolCalls,
    promptCaching: explicit.promptCaching ?? defaults.promptCaching,
  };
}

export function getEndpointLabel(endpoint?: ProviderEndpoint): string {
  return endpoint?.label || OPENROUTER_ENDPOINT.label;
}

/** A local OpenAI-compatible server (Ollama, LM Studio, llama.cpp) usually has no key. */
export function allowsKeylessCalls(endpoint: ProviderEndpoint): boolean {
  return endpoint.kind === 'openai-compatible' && !!endpoint.baseUrl;
}

/**
 * Reserved prefix for endpoint-scoped identifiers — key references and model
 * ids alike. A provider model id is `vendor/model`, so nothing upstream can
 * produce a first segment containing a colon: that is what keeps a user
 * endpoint from shadowing a real OpenRouter model.
 */
export const ENDPOINT_NAMESPACE = 'endpoint:';

/** One key per endpoint, referenced by id so the value never travels with the config. */
export function endpointKeyRef(endpointId: string): string {
  return `${ENDPOINT_NAMESPACE}${endpointId}`;
}

const SLUG_INVALID_RE = /[^a-z0-9]+/g;

/** Stable, url-safe endpoint id derived from the label, unique against `taken`. */
export function slugifyEndpointId(label: string, taken: Iterable<string> = []): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(SLUG_INVALID_RE, '-')
    .replace(/^-+|-+$/g, '');
  const seed = base || 'endpoint';
  const used = new Set(taken);
  for (const id of BUILT_IN_ENDPOINTS) used.add(id.id);
  if (!used.has(seed)) return seed;
  let counter = 2;
  while (used.has(`${seed}-${counter}`)) counter += 1;
  return `${seed}-${counter}`;
}

/** Endpoint-scoped model ids keep `(endpointId, transportModelId)` unique in one flat list. */
export function buildEndpointModelId(endpointId: string, modelId: string): string {
  return `${ENDPOINT_NAMESPACE}${endpointId}/${modelId}`;
}

/**
 * Inverse of `buildEndpointModelId`; undefined for anything outside the
 * namespace. The transport model id may itself contain slashes, so only the
 * first one is a separator.
 */
export function parseEndpointModelId(
  value: string,
): { endpointId: string; modelId: string } | undefined {
  if (!value.startsWith(ENDPOINT_NAMESPACE)) return undefined;
  const rest = value.slice(ENDPOINT_NAMESPACE.length);
  const separator = rest.indexOf('/');
  if (separator <= 0 || separator === rest.length - 1) return undefined;
  return { endpointId: rest.slice(0, separator), modelId: rest.slice(separator + 1) };
}

export function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}
