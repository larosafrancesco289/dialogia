// Module: models/dynamicDefaults
// Responsibility: Resolve "latest" default-model aliases against the live
// model list so curated defaults track provider releases without code edits.

import type { ModelDescriptor } from '@/lib/types';
import { isRecord } from '@/lib/utils/guards';

export const DYNAMIC_MODEL_ID_PREFIX = '~';

export type DynamicModelAlias = {
  id: string;
  label: string;
  /** Shown where the alias is surfaced, explaining the selection rule. */
  description: string;
  /** Concrete id used when the model list is empty or nothing matches. */
  fallbackId: string;
  matches: (model: ModelDescriptor) => boolean;
  /** Comparator ordering candidates best-first. */
  compare: (a: ModelDescriptor, b: ModelDescriptor) => number;
};

const completionPrice = (model: ModelDescriptor): number => {
  const value = Number(model.pricing?.completion ?? 0);
  return Number.isFinite(value) ? value : 0;
};

const createdAt = (model: ModelDescriptor): number => {
  const raw = isRecord(model.raw) ? model.raw : undefined;
  const value = Number(raw?.created ?? 0);
  return Number.isFinite(value) ? value : 0;
};

const idOf = (model: ModelDescriptor): string => String(model.id || '').toLowerCase();

const EXCLUDED_VARIANT_RE = /(:free|-free$|mini|nano|image|audio|realtime|codex|oss|search)/;

export const DYNAMIC_MODEL_ALIASES: DynamicModelAlias[] = [
  {
    id: '~anthropic/frontier',
    label: 'Claude Frontier',
    description:
      'Most capable Anthropic model available — the Mythos-class tier (currently Fable), never Opus while a Fable is offered',
    fallbackId: 'anthropic/claude-fable-5',
    matches: (model) => {
      const id = idOf(model);
      return (
        (id.startsWith('anthropic/claude-') || id.startsWith('anthropic-direct/claude-')) &&
        !EXCLUDED_VARIANT_RE.test(id) &&
        !id.includes('haiku')
      );
    },
    // Mythos-class models (Fable/Mythos) sit above Opus in capability, so the
    // family wins outright; price then recency settle everything else.
    compare: (a, b) =>
      Number(/fable|mythos/.test(idOf(b))) - Number(/fable|mythos/.test(idOf(a))) ||
      completionPrice(b) - completionPrice(a) ||
      createdAt(b) - createdAt(a),
  },
  {
    id: '~openai/gpt-latest',
    label: 'GPT Latest',
    description:
      'Newest mainline GPT model on OpenRouter (picked by release date; excludes Pro/Mini variants)',
    fallbackId: 'openai/gpt-5.5',
    matches: (model) => {
      const id = idOf(model);
      // Track the classic flagship line only: Pro variants are priced far
      // above it, and mini/nano/chat variants sit below it.
      return (
        /^openai\/gpt-\d/.test(id) &&
        !EXCLUDED_VARIANT_RE.test(id) &&
        !/\bpro\b/.test(id) &&
        !id.includes('chat')
      );
    },
    compare: (a, b) => createdAt(b) - createdAt(a) || completionPrice(b) - completionPrice(a),
  },
  {
    id: '~x-ai/grok-latest',
    label: 'Grok Latest',
    description: 'Newest mainline Grok model on OpenRouter (excludes code, image, and fast variants)',
    fallbackId: 'x-ai/grok-4.3',
    matches: (model) => {
      const id = idOf(model);
      return (
        /^x-ai\/grok-\d/.test(id) &&
        !EXCLUDED_VARIANT_RE.test(id) &&
        !id.includes('code') &&
        !id.includes('fast')
      );
    },
    compare: (a, b) => createdAt(b) - createdAt(a) || completionPrice(b) - completionPrice(a),
  },
];

const ALIAS_BY_ID = new Map(DYNAMIC_MODEL_ALIASES.map((alias) => [alias.id, alias]));

export function isDynamicModelId(id: string | undefined | null): boolean {
  return typeof id === 'string' && id.startsWith(DYNAMIC_MODEL_ID_PREFIX);
}

export function getDynamicModelAlias(id: string): DynamicModelAlias | undefined {
  return ALIAS_BY_ID.get(id);
}

/**
 * Resolve a dynamic alias to a concrete model id. Non-alias ids pass through
 * unchanged; unknown aliases and empty lists fall back to the alias pin.
 */
export function resolveDynamicModelId(id: string, models: ModelDescriptor[]): string {
  if (!isDynamicModelId(id)) return id;
  const alias = ALIAS_BY_ID.get(id);
  // Not one of ours: OpenRouter publishes its own '~vendor/model-latest'
  // alias ids, which are real, requestable models — pass them through.
  if (!alias) return id;
  const candidates = models.filter(alias.matches);
  if (candidates.length === 0) return alias.fallbackId;
  candidates.sort(alias.compare);
  return candidates[0].id;
}
