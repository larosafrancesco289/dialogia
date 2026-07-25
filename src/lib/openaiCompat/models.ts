import type { TransportAuth } from '@/lib/auth/transport';
import type { ModelDescriptor } from '@/lib/types';
import type { TransportFetchModelsOptions } from '@/lib/transport/types';
import { orFetchModels } from '@/lib/openrouter/http';
import { buildEndpointModelId, endpointCapabilities } from '@/lib/transport/endpoints';
import { isRecord } from '@/lib/utils/guards';

function readModelIds(payload: unknown): string[] {
  const entries = isRecord(payload) && Array.isArray(payload.data) ? payload.data : [];
  const ids: string[] = [];
  for (const entry of entries) {
    if (typeof entry === 'string') ids.push(entry);
    else if (isRecord(entry) && typeof entry.id === 'string' && entry.id) ids.push(entry.id);
  }
  return ids;
}

/**
 * Describe one model of a user-configured endpoint. There is no metadata to
 * discover here, so capabilities are exactly what the user declared — no
 * name-regex inference.
 */
function describe(auth: TransportAuth, modelId: string): ModelDescriptor {
  const endpoint = auth.endpoint;
  const caps = endpointCapabilities(endpoint);
  const supportedParameters = [
    ...(caps.tools ? ['tools'] : []),
    ...(caps.vision ? ['vision'] : []),
    ...(caps.reasoning ? ['reasoning'] : []),
  ];
  return {
    id: buildEndpointModelId(endpoint.id, modelId),
    name: modelId,
    endpointId: endpoint.id,
    transportModelId: modelId,
    providerDisplay: endpoint.label,
    raw: {
      id: modelId,
      supported_parameters: supportedParameters,
      input_modalities: caps.vision ? ['text', 'image'] : ['text'],
      output_modalities: ['text'],
    },
  };
}

/**
 * Models the user typed, plus whatever `/models` reports. The probe is a bonus:
 * llama.cpp and some vLLM deployments do not serve that route at all, and the
 * configured list must keep working when it 404s.
 */
export async function fetchModels(
  auth: TransportAuth,
  opts: TransportFetchModelsOptions & { fetchFn?: typeof orFetchModels } = {},
): Promise<ModelDescriptor[]> {
  const configured = auth.endpoint.modelIds ?? [];
  const discovered: string[] = [];

  if (auth.endpoint.baseUrl) {
    const fetchFn = opts.fetchFn ?? orFetchModels;
    try {
      const res = await fetchFn(auth, { signal: opts.signal, origin: opts.origin });
      if (res.ok) {
        const payload = await res.json().catch(() => null);
        discovered.push(...readModelIds(payload));
      }
    } catch {
      // Unreachable or route-less server: the configured list still stands.
    }
  }

  const seen = new Set<string>();
  const models: ModelDescriptor[] = [];
  for (const modelId of [...configured, ...discovered]) {
    const trimmed = modelId.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    models.push(describe(auth, trimmed));
  }
  return models;
}
