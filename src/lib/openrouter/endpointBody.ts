// Module: openrouter/endpointBody
// Responsibility: Translate the calling endpoint into body-building constraints.
// The built-ins are metadata-rich and ungated; a user-configured
// OpenAI-compatible server emits only what its capabilities declare.

import type { TransportAuth } from '@/lib/auth/transport';
import {
  endpointCapabilities,
  parseEndpointModelId,
  type EndpointCapabilities,
} from '@/lib/transport/endpoints';

export function endpointBodyOptions(auth?: TransportAuth): {
  capabilities?: EndpointCapabilities;
  allowProviderExtensions: boolean;
} {
  const endpoint = auth?.endpoint;
  if (!endpoint || endpoint.kind !== 'openai-compatible') {
    return { allowProviderExtensions: true };
  }
  return { capabilities: endpointCapabilities(endpoint), allowProviderExtensions: false };
}

/** App-side model ids for user endpoints are `endpoint:<id>/<model>`; the wire wants the tail. */
export function endpointWireModelId(auth: TransportAuth | undefined, model: string): string {
  const endpoint = auth?.endpoint;
  if (!endpoint || endpoint.kind !== 'openai-compatible') return model;
  const scoped = parseEndpointModelId(model);
  return scoped && scoped.endpointId === endpoint.id ? scoped.modelId : model;
}
