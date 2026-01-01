import type { ModelDescriptor, ModelTransport } from '@/lib/types';
import {
  formatModelLabel,
  isAudioInputSupported,
  isImageOutputSupported,
  isReasoningSupported,
  isVisionSupported,
} from '@/lib/models';
import { describeModelPricing } from '@/lib/cost';
import { getModelTransport, getModelTransportLabel } from '@/lib/providers';

export type ModelSearchResult = {
  id: string;
  displayName: string;
  provider: string; // slug used for filtering/ZDR
  providerLabel: string;
  transport: ModelTransport;
  shortId: string;
  fullId: string;
  price?: string;
  capabilities: {
    reasoning: boolean;
    vision: boolean;
    audio: boolean;
    image: boolean;
    zdr: boolean;
  };
  contextLength?: number;
  model?: ModelDescriptor;
};

export type HighlightSegment = {
  text: string;
  highlight: boolean;
};

export function normalizeModelQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function splitModelQuery(normalized: string): string[] {
  return normalized ? normalized.split(' ') : [];
}

export function buildModelSearchResult(
  model: ModelDescriptor,
  opts: {
    zdrModelIds?: string[];
    zdrProviderIds?: string[];
  },
): ModelSearchResult {
  const transport = getModelTransport(model);
  const provider = String(model.id).split('/')[0] || 'openrouter';
  const providerLabel = getModelTransportLabel(model);
  const shortId = model.id.includes('/') ? model.id.split('/').slice(1).join('/') : model.id;
  const displayName = formatModelLabel({ model, fallbackId: model.id, fallbackName: model.name });
  const price = describeModelPricing(model);
  const capabilities = {
    reasoning: isReasoningSupported(model),
    vision: isVisionSupported(model),
    audio: isAudioInputSupported(model),
    image: isImageOutputSupported(model),
    zdr:
      Boolean(opts.zdrModelIds && opts.zdrModelIds.includes(model.id)) ||
      Boolean(opts.zdrProviderIds && opts.zdrProviderIds.includes(provider)),
  };
  return {
    id: model.id,
    displayName,
    provider,
    providerLabel,
    transport,
    shortId,
    fullId: model.id,
    price,
    capabilities,
    contextLength: model.context_length,
    model,
  };
}

export function buildModelSearchResults(
  models: ModelDescriptor[],
  queryWords: string[],
  opts: {
    maxResults?: number;
    zdrModelIds?: string[];
    zdrProviderIds?: string[];
  },
): ModelSearchResult[] {
  if (!queryWords.length) return [];
  const maxResults = opts.maxResults ?? 60;
  const filtered = models.filter((model) => {
    const providerLabel = getModelTransportLabel(model);
    const hay = `${model.id} ${model.name ?? ''} ${providerLabel}`.toLowerCase();
    return queryWords.every((word) => hay.includes(word));
  });
  return filtered.slice(0, maxResults).map((model) => buildModelSearchResult(model, opts));
}

export function getHighlightSegments(text: string, queryWords: string[]): HighlightSegment[] {
  if (!queryWords.length) return [{ text, highlight: false }];
  const pattern = queryWords.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  if (!pattern) return [{ text, highlight: false }];
  try {
    const regex = new RegExp(`(${pattern})`, 'gi');
    const matcher = new RegExp(`^(${pattern})$`, 'i');
    const segments = text.split(regex).filter((segment) => segment.length > 0);
    if (!segments.length) return [{ text, highlight: false }];
    return segments.map((segment) => ({
      text: segment,
      highlight: matcher.test(segment),
    }));
  } catch {
    return [{ text, highlight: false }];
  }
}
