export type ZdrEndpoint = {
  providerId?: string;
  id?: string;
  name?: string;
  url?: string;
  models: string[];
  raw: Record<string, unknown>;
};

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as RecordValue;
}

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
    const record = asRecord(entry);
    const id = getString(record?.id);
    if (id) ids.push(id);
  }
  return ids;
}

function resolveEndpointList(payload: unknown): RecordValue[] {
  const record = asRecord(payload);
  const data = record?.data;
  if (Array.isArray(data)) return data.map(asRecord).filter(Boolean) as RecordValue[];
  const endpoints = record?.endpoints;
  if (Array.isArray(endpoints)) return endpoints.map(asRecord).filter(Boolean) as RecordValue[];
  if (Array.isArray(payload)) return payload.map(asRecord).filter(Boolean) as RecordValue[];
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
