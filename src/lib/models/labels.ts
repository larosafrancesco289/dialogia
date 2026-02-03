import type { ModelDescriptor } from '@/lib/types';
import { isRecord } from '@/lib/utils/guards';

export function stripProviderPrefix(label?: string): string {
  return String(label ?? '')
    .replace(/^[^:]+:\s*/, '')
    .trim();
}

function deriveNameFromId(id?: string): string {
  if (!id) return '';
  const segment = id.includes('/') ? (id.split('/').pop() ?? id) : id;
  const normalized = segment.replace(/[-_]+/g, ' ').trim();
  return normalized || segment;
}

export function formatModelLabel(params: {
  model?: ModelDescriptor | null;
  fallbackId?: string;
  fallbackName?: string;
}): string {
  const { model, fallbackId, fallbackName } = params;
  const raw = isRecord(model?.raw) ? model?.raw : undefined;
  const rawName = typeof raw?.name === 'string' ? raw.name : undefined;
  const rawInfo = isRecord(raw?.info) ? raw.info : undefined;
  const infoDisplay = typeof rawInfo?.display === 'string' ? rawInfo.display : undefined;
  const infoName = typeof rawInfo?.name === 'string' ? rawInfo.name : undefined;
  const candidates = [model?.name, rawName, infoDisplay, infoName, fallbackName];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    if (trimmed.toLowerCase() === 'free') continue;
    return stripProviderPrefix(trimmed);
  }
  const idSource = fallbackId || model?.id;
  const derived = deriveNameFromId(idSource);
  return derived || 'Pick model';
}
