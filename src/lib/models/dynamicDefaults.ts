// Module: models/dynamicDefaults
// Responsibility: Resolve a model family ("the newest Claude Opus") to the
// concrete model it names today, so curated picks and defaults track releases
// without code edits. The provider says what is current; nothing is guessed
// from prices or release dates while it does.
//
// A family id is OpenRouter's own alias id ('~anthropic/claude-opus-latest').
// OpenRouter lists each alias with `alias_target`, the model it points to. The
// Claude API has no moving aliases (every id is a pinned snapshot), but its ids
// follow a documented scheme, claude-{name}-{major}[-{minor}], and its list is
// newest first, so the same family resolves there by name.
//
// A chat stores the concrete id it resolved to when it started, and requests
// always name that id: pricing, capabilities, ZDR and caching then describe
// the real model, and a conversation never changes model underneath itself.

import type { ModelDescriptor } from '@/lib/types';
import { isRecord } from '@/lib/utils/guards';

export const DYNAMIC_MODEL_ID_PREFIX = '~';

export type ModelFamily = {
  id: string;
  label: string;
  /** The concrete model used while the model list is empty or lacks the family. */
  pin: string;
};

/** The families this app names anywhere: curated picks, defaults, titles. */
export const MODEL_FAMILIES: ModelFamily[] = [
  { id: '~openai/gpt-luna-latest', label: 'GPT Luna', pin: 'openai/gpt-6-luna' },
  { id: '~openai/gpt-sol-latest', label: 'GPT Sol', pin: 'openai/gpt-6-sol' },
  { id: '~anthropic/claude-opus-latest', label: 'Claude Opus', pin: 'anthropic/claude-opus-5.5' },
  {
    id: '~anthropic/claude-fable-latest',
    label: 'Claude Fable',
    pin: 'anthropic/claude-fable-5.1',
  },
  {
    id: '~anthropic/claude-haiku-latest',
    label: 'Claude Haiku',
    pin: 'anthropic/claude-haiku-4.5',
  },
  { id: '~google/gemini-pro-latest', label: 'Gemini Pro', pin: 'google/gemini-3.1-pro-preview' },
  { id: '~x-ai/grok-latest', label: 'Grok', pin: 'x-ai/grok-4.7' },
  { id: '~moonshotai/kimi-latest', label: 'Kimi', pin: 'moonshotai/kimi-k3' },
];

// Aliases this app minted before providers had their own. Saved settings and
// chat defaults may still hold them.
const RETIRED_ALIASES: Record<string, string> = {
  '~openai/gpt-latest': '~openai/gpt-luna-latest',
  '~anthropic/frontier': '~anthropic/claude-fable-latest',
};

const FAMILY_BY_ID = new Map(MODEL_FAMILIES.map((family) => [family.id, family]));

export function isDynamicModelId(id: string | undefined | null): boolean {
  return typeof id === 'string' && id.startsWith(DYNAMIC_MODEL_ID_PREFIX);
}

export function getModelFamily(id: string): ModelFamily | undefined {
  return FAMILY_BY_ID.get(RETIRED_ALIASES[id] ?? id);
}

/** The model a provider's alias entry points to, when the entry is one. */
export function aliasTargetOf(model: ModelDescriptor | undefined): string | undefined {
  const raw = model && isRecord(model.raw) ? model.raw : undefined;
  const target = raw && isRecord(raw.alias_target) ? raw.alias_target.slug : undefined;
  return typeof target === 'string' && target ? target : undefined;
}

const releasedAt = (model: ModelDescriptor): number => {
  const raw = isRecord(model.raw) ? model.raw : undefined;
  const created = Number(raw?.created);
  if (Number.isFinite(created) && created > 0) return created * 1000;
  const createdAt = typeof raw?.created_at === 'string' ? Date.parse(raw.created_at) : NaN;
  return Number.isFinite(createdAt) ? createdAt : 0;
};

// A version segment: 5, 4.6, v4, k3, or a snapshot date.
const VERSION = String.raw`(?:v?\d[\d.]*|k\d[\d.]*)`;

/**
 * Models whose id is the family's name with only versions around it:
 * '~anthropic/claude-opus-latest' takes claude-opus-5.5 and claude-opus-5-5,
 * not claude-opus-5.5:batch; '~openai/gpt-luna-latest' takes gpt-6-luna, not
 * gpt-6-luna-pro.
 */
function familyPattern(familyId: string): { vendor: string; re: RegExp } | undefined {
  const match = /^~([^/]+)\/(.+)-latest$/.exec(familyId);
  if (!match) return undefined;
  const [, vendor, stem] = match;
  const words = stem.split('-').map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const between = `-(?:${VERSION}-)*`;
  const re = new RegExp(`^${words.join(between)}(?:-${VERSION})*(?:-preview)?$`);
  return { vendor, re };
}

function newestInFamily(familyId: string, models: ModelDescriptor[]): string | undefined {
  const pattern = familyPattern(familyId);
  if (!pattern) return undefined;
  const prefixes = [`${pattern.vendor}/`];
  if (pattern.vendor === 'anthropic') prefixes.push('anthropic-direct/');
  const members = models.filter((model) => {
    if (aliasTargetOf(model)) return false;
    const prefix = prefixes.find((p) => model.id.startsWith(p));
    return !!prefix && pattern.re.test(model.id.slice(prefix.length));
  });
  // Stable: equal dates keep the list's order, which the Claude API gives newest first.
  members.sort((a, b) => releasedAt(b) - releasedAt(a));
  return members[0]?.id;
}

/**
 * The concrete model a family id names right now. A concrete id passes through;
 * an alias this app does not know is a provider's own requestable id and passes
 * through too.
 */
export function resolveDynamicModelId(id: string, models: ModelDescriptor[]): string {
  if (!isDynamicModelId(id)) return id;
  const familyId = RETIRED_ALIASES[id] ?? id;
  const target = aliasTargetOf(models.find((model) => model.id === familyId));
  if (target) return target;
  const named = newestInFamily(familyId, models);
  if (named) return named;
  return FAMILY_BY_ID.get(familyId)?.pin ?? familyId;
}

/**
 * The first of `preferred` that the loaded models can serve. Past the list, a
 * model from a built-in provider beats one from the user's own server, which
 * is often a local test and may not even be running.
 */
export function resolveFirstAvailableModelId(
  preferred: readonly string[],
  models: ModelDescriptor[],
  isBuiltInEndpoint: (endpointId: string) => boolean,
): string {
  const available = new Set(models.map((model) => model.id));
  for (const id of preferred) {
    const resolved = resolveDynamicModelId(id, models);
    if (available.has(resolved)) return resolved;
  }
  const builtIn = models.find(
    (model) => !aliasTargetOf(model) && (!model.endpointId || isBuiltInEndpoint(model.endpointId)),
  );
  const first = builtIn ?? models.find((model) => !aliasTargetOf(model));
  return first?.id ?? resolveDynamicModelId(preferred[0] ?? '', models);
}
