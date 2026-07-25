import type { ModelDescriptor } from '@/lib/types';
import { getEndpoint, listEndpoints } from '@/lib/transport/endpointRegistry';

/** At least one endpoint is configured. Built-ins always are, so this is effectively always true. */
export function hasAnyEndpoint(): boolean {
  return listEndpoints().length > 0;
}

/**
 * A model whose endpoint the user has since deleted must not stay selectable.
 * Descriptors persisted before endpoints existed carry no `endpointId` and are
 * resolved by the legacy id rules instead, so they stay available.
 */
export function isModelEndpointAvailable(model?: ModelDescriptor | null): boolean {
  if (!model?.endpointId) return true;
  return getEndpoint(model.endpointId) != null;
}
