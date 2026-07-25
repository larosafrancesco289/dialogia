// Module: transport/endpointRegistry
// Responsibility: The synchronous view of "which endpoints exist right now".
//
// Endpoint *configuration* is owned by the store slice, but the request path
// (auth resolution, body building) is synchronous and sits below the store, so
// the slice pushes its list here and everything else reads from here.

import { isAnthropicProxyEnabled, isOpenRouterProxyEnabled } from '@/lib/env/public';
import type { ModelDescriptor } from '@/lib/transport/models';
import {
  ANTHROPIC_ENDPOINT,
  BUILT_IN_ENDPOINTS,
  OPENROUTER_ENDPOINT,
  isBuiltInEndpointId,
  type ProviderEndpoint,
} from '@/lib/transport/endpoints';

let customEndpoints: ProviderEndpoint[] = [];

/** Built-ins carry the deployment's proxy configuration, which is not user-editable. */
function withProxyFlags(endpoint: ProviderEndpoint): ProviderEndpoint {
  if (endpoint.id === OPENROUTER_ENDPOINT.id) {
    return { ...endpoint, useProxy: isOpenRouterProxyEnabled() };
  }
  if (endpoint.id === ANTHROPIC_ENDPOINT.id) {
    return { ...endpoint, useProxy: isAnthropicProxyEnabled() };
  }
  return endpoint;
}

/** Called by the endpoint slice whenever the user's configuration changes. */
export function setCustomEndpoints(endpoints: ProviderEndpoint[]): void {
  customEndpoints = endpoints.filter((endpoint) => !isBuiltInEndpointId(endpoint.id));
}

export function listEndpoints(): ProviderEndpoint[] {
  return [...BUILT_IN_ENDPOINTS.map(withProxyFlags), ...customEndpoints];
}

export function listCustomEndpoints(): ProviderEndpoint[] {
  return customEndpoints;
}

export function getEndpoint(id?: string): ProviderEndpoint | undefined {
  if (!id) return undefined;
  return listEndpoints().find((endpoint) => endpoint.id === id);
}

export function getDefaultEndpoint(): ProviderEndpoint {
  return withProxyFlags(OPENROUTER_ENDPOINT);
}

/**
 * Which endpoint serves a model id. `ModelDescriptor.endpointId` is authoritative;
 * the id-prefix rules below exist only for chats persisted before endpoints existed
 * (and for user endpoints, whose model ids are `<endpointId>/<model>` by construction).
 */
export function resolveModelEndpoint(
  modelId?: string,
  model?: ModelDescriptor | null,
): ProviderEndpoint {
  const byDescriptor = getEndpoint(model?.endpointId);
  if (byDescriptor) return byDescriptor;

  if (typeof modelId === 'string' && modelId) {
    for (const endpoint of customEndpoints) {
      if (modelId.startsWith(`${endpoint.id}/`)) return endpoint;
    }
    if (modelId.startsWith('anthropic-direct/') || modelId.startsWith('anthropic/')) {
      return withProxyFlags(ANTHROPIC_ENDPOINT);
    }
  }

  return getDefaultEndpoint();
}

export function resetEndpointRegistryForTest(): void {
  customEndpoints = [];
}
