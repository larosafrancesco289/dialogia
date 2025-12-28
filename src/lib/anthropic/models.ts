import type { ModelDescriptor } from '@/lib/types';
import { anthropicFetchModels } from '@/lib/api/anthropicClient';
import { API_ERROR_CODES } from '@/lib/api/errors';
import type { TransportFetchModelsOptions } from '@/lib/transport/types';
import { isRecord } from '@/lib/utils/guards';
import { buildAnthropicError, wrapAnthropicClientError } from '@/lib/anthropic/errors';

export async function fetchModels(
  apiKey: string,
  opts: TransportFetchModelsOptions = {},
): Promise<ModelDescriptor[]> {
  let res: Response;
  try {
    res = await anthropicFetchModels(apiKey, opts);
  } catch (error) {
    throw wrapAnthropicClientError(error, API_ERROR_CODES.PROVIDER_MODELS_FAILED);
  }
  if (res.status === 401 || res.status === 403) {
    throw await buildAnthropicError(
      res,
      API_ERROR_CODES.UNAUTHORIZED,
      'Invalid Anthropics API key',
    );
  }
  if (!res.ok) {
    throw await buildAnthropicError(res, API_ERROR_CODES.PROVIDER_MODELS_FAILED);
  }
  const data: { data?: unknown[] } | null = await res.json().catch(() => null);
  const items = Array.isArray(data?.data) ? data.data : [];
  return items.map((entry) => {
    const record = isRecord(entry) ? entry : {};
    const rawId = typeof record.id === 'string' ? record.id : '';
    const canonicalId = rawId.includes('/') ? rawId : `anthropic/${rawId}`;
    const displayName = typeof record.display_name === 'string' ? record.display_name : undefined;
    return {
      id: canonicalId,
      name: displayName || rawId,
      raw: entry,
      transport: 'anthropic' as const,
      transportModelId: rawId,
      providerDisplay: 'Anthropic',
    };
  });
}
