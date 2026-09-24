import { isRecord } from '@/lib/utils/guards';

export type ZdrEndpoint = {
  providerId?: string;
  id?: string;
  name?: string;
  url?: string;
  models: string[];
  raw: Record<string, unknown>;
};

type RecordValue = Record<string, unknown>;

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readModelIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (trimmed) ids.push(trimmed);
      continue;
    }
    const id = isRecord(entry) ? getString(entry.id) : undefined;
    if (id) ids.push(id);
  }
  return ids;
}

function resolveEndpointList(payload: unknown): RecordValue[] {
  const record = isRecord(payload) ? payload : undefined;
  const data = record?.data;
  if (Array.isArray(data)) return data.filter(isRecord);
  const endpoints = record?.endpoints;
  if (Array.isArray(endpoints)) return endpoints.filter(isRecord);
  if (Array.isArray(payload)) return payload.filter(isRecord);
  return [];
}

export function parseZdrEndpoints(payload: unknown): ZdrEndpoint[] {
  const items = resolveEndpointList(payload);
  return items.map((record) => {
    const providerId =
      getString(record.provider) ||
      getString(record.provider_id) ||
      getString(record.providerId) ||
      getString(record.slug);
    const id = getString(record.id);
    const name = getString(record.name);
    const url = getString(record.url) || getString(record.endpoint) || getString(record.base_url);
    const models = readModelIds(record.models);

    return {
      providerId,
      id,
      name,
      url,
      models,
      raw: record,
    };
  });
}
