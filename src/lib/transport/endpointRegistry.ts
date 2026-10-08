// Module: transport/endpointRegistry
// Responsibility: The synchronous view of "which endpoints exist right now".
//
// Endpoint *configuration* is owned by the store slice, but the request path
// (auth resolution, body building) is synchronous and sits below the store, so
// the slice pushes its list here and everything else reads from here.

import { getKey } from '@/lib/keys/store';
import type { ModelDescriptor } from '@/lib/transport/models';
import {
  ANTHROPIC_ENDPOINT,
  ANTHROPIC_ENDPOINT_ID,
  BUILT_IN_ENDPOINTS,
  OPENROUTER_ENDPOINT,
  ENDPOINT_NAMESPACE,
  isBuiltInEndpointId,
  parseEndpointModelId,
  type ProviderEndpoint,
} from '@/lib/transport/endpoints';

let customEndpoints: ProviderEndpoint[] = [];
let anthropicWorkspaceId: string | undefined;

/** Called by the endpoint slice whenever the user's configuration changes. */
export function setCustomEndpoints(endpoints: ProviderEndpoint[]): void {
  customEndpoints = endpoints.filter((endpoint) => !isBuiltInEndpointId(endpoint.id));
}

/** Called by the endpoint slice whenever the Claude connection's workspace changes. */
export function setAnthropicWorkspaceId(workspaceId: string | undefined): void {
  anthropicWorkspaceId = workspaceId || undefined;
}

/** The built-in Claude connection, with the workspace its requests name. */
function anthropicEndpoint(): ProviderEndpoint {
  return anthropicWorkspaceId
    ? { ...ANTHROPIC_ENDPOINT, workspaceId: anthropicWorkspaceId }
    : ANTHROPIC_ENDPOINT;
}

export function listEndpoints(): ProviderEndpoint[] {
  const builtIns = BUILT_IN_ENDPOINTS.map((endpoint) =>
    endpoint.id === ANTHROPIC_ENDPOINT_ID ? anthropicEndpoint() : endpoint,
  );
  return [...builtIns, ...customEndpoints];
}

export function getEndpoint(id?: string): ProviderEndpoint | undefined {
  if (!id) return undefined;
  return listEndpoints().find((endpoint) => endpoint.id === id);
}

export function getDefaultEndpoint(): ProviderEndpoint {
  return OPENROUTER_ENDPOINT;
}

export const UNKNOWN_ENDPOINT = 'unknown_endpoint';

export type UnknownEndpointError = Error & {
  code: typeof UNKNOWN_ENDPOINT;
  endpointId: string;
  modelId: string;
};

export function isUnknownEndpointError(error: unknown): error is UnknownEndpointError {
  return error instanceof Error && (error as UnknownEndpointError).code === UNKNOWN_ENDPOINT;
}

function unknownEndpoint(modelId: string, endpointId: string): UnknownEndpointError {
  const error = new Error(UNKNOWN_ENDPOINT) as UnknownEndpointError;
  error.code = UNKNOWN_ENDPOINT;
  error.endpointId = endpointId;
  error.modelId = modelId;
  return error;
}

/**
 * Which endpoint serves a model id, or undefined when the id names a user
 * endpoint that is no longer configured. `ModelDescriptor.endpointId` is
 * authoritative; the id rules below cover chats persisted before endpoints
 * existed, plus the `endpoint:<id>/<model>` namespace user endpoints own.
 */
export function findModelEndpoint(
  modelId?: string,
  model?: ModelDescriptor | null,
): ProviderEndpoint | undefined {
  const byDescriptor = getEndpoint(model?.endpointId);
  if (byDescriptor) return byDescriptor;

  if (typeof modelId === 'string' && modelId) {
    // The namespace is reserved: nothing in it may fall through to the default.
    if (modelId.startsWith(ENDPOINT_NAMESPACE)) {
      const scoped = parseEndpointModelId(modelId);
      return scoped ? getEndpoint(scoped.endpointId) : undefined;
    }
    if (modelId.startsWith('anthropic-direct/')) return anthropicEndpoint();
    // OpenRouter's own Claude ids ('anthropic/...', what new chats start with)
    // go where a loaded list sends them: to OpenRouter whenever it has a key,
    // so a chat never starts on one provider and goes on with another. Without
    // one, the Claude API takes them (older chats, a Claude key alone).
    if (modelId.startsWith('anthropic/')) {
      return getKey(OPENROUTER_ENDPOINT.apiKeyRef) ? OPENROUTER_ENDPOINT : anthropicEndpoint();
    }
  }

  return getDefaultEndpoint();
}

/**
 * The request path's view: a model id scoped to a deleted endpoint must fail
 * rather than fall back to OpenRouter, which would ship a local-only chat's
 * history to a third party.
 */
export function resolveModelEndpoint(
  modelId?: string,
  model?: ModelDescriptor | null,
): ProviderEndpoint {
  const endpoint = findModelEndpoint(modelId, model);
  if (endpoint) return endpoint;
  const scoped = parseEndpointModelId(modelId ?? '');
  throw unknownEndpoint(modelId ?? '', scoped?.endpointId ?? '');
}

/** @internal Test seam: resets module state between tests. */
export function resetEndpointRegistryForTest(): void {
  customEndpoints = [];
  anthropicWorkspaceId = undefined;
}
