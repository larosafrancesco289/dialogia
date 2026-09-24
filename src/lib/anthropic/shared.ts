import { isRecord } from '@/lib/utils/guards';

export const ANTHROPIC_API_VERSION = '2023-06-01';
export const ANTHROPIC_DEFAULT_MAX_TOKENS = 2048;
export const ANTHROPIC_MIN_THINKING_BUDGET = 1024;
export const ANTHROPIC_TRANSPORT_PREFIX = 'anthropic-direct/';
const ANTHROPIC_ACCEPTED_PREFIXES = [ANTHROPIC_TRANSPORT_PREFIX, 'anthropic/'] as const;

/**
 * Map public Anthropic aliases to the concrete API model IDs documented by Anthropic.
 * When an alias already matches the API ID, it maps to itself.
 */
export const ANTHROPIC_MODEL_ALIAS_MAP: Record<string, string> = {
  'claude-fable-5': 'claude-fable-5',
  'claude-opus-4-8': 'claude-opus-4-8',
  'claude-opus-4-7': 'claude-opus-4-7',
  'claude-opus-4-6': 'claude-opus-4-6',
  'claude-sonnet-4-6': 'claude-sonnet-4-6',
  'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
  'claude-haiku-4.5': 'claude-haiku-4-5-20251001',
  'claude-sonnet-4-5': 'claude-sonnet-4-5-20250929',
  'claude-sonnet-4.5': 'claude-sonnet-4-5-20250929',
  'claude-opus-4-5': 'claude-opus-4-5-20251101',
  'claude-opus-4-1': 'claude-opus-4-1-20250805',
  'claude-sonnet-4-0': 'claude-sonnet-4-20250514',
  'claude-opus-4-0': 'claude-opus-4-20250514',
  'claude-3-7-sonnet-latest': 'claude-3-7-sonnet-latest',
  'claude-mythos-preview': 'claude-mythos-preview',
};

const DIRECT_TO_PUBLIC_MODEL_MAP = new Map<string, string>(
  Object.entries(ANTHROPIC_MODEL_ALIAS_MAP).map(([publicId, directId]) => [directId, publicId]),
);

const SNAPSHOT_MODEL_ID_RE = /^claude-[a-z0-9-]+-\d{8}$/;

/**
 * What a Claude id says about its model, read from Anthropic's documented
 * scheme (claude-{name}-{major}[-{minor}], a -{YYYYMMDD} snapshot date before
 * the 4.6 generation, claude-{major}-{minor}-{name} before Claude 4). Rules on
 * the generation keep working for models released after this was written; a
 * list of ids did not (Opus 5.5 got the retired budget-thinking request).
 */
type ClaudeGeneration = { name: string; version: number };

function claudeGeneration(slug: string): ClaudeGeneration | undefined {
  const id = slug.replace(/\./g, '-');
  const modern = /^claude-([a-z]+)-(\d+)(?:-(\d))?(?:-(\d{8}))?$/.exec(id);
  if (modern) {
    const [, name, major, minor] = modern;
    return { name, version: Number(major) + (minor ? Number(minor) / 10 : 0) };
  }
  const legacy = /^claude-(\d+)(?:-(\d))?-([a-z]+)(?:-(?:\d{8}|latest))?$/.exec(id);
  if (legacy) {
    const [, major, minor, name] = legacy;
    return { name, version: Number(major) + (minor ? Number(minor) / 10 : 0) };
  }
  return undefined;
}

// The 4.6 generation on takes adaptive thinking; manual budget thinking is
// "not accepted on later models" (Anthropic's model table).
const isAdaptiveGeneration = (gen: ClaudeGeneration | undefined): boolean =>
  !!gen && gen.version >= 4.6;

// Thinking cannot be turned off on the Mythos class, nor on Opus from 5.5,
// which the model table lists as "Adaptive (always on)".
const isThinkingAlwaysOn = (gen: ClaudeGeneration | undefined): boolean =>
  !!gen &&
  (gen.name === 'fable' || gen.name === 'mythos' || (gen.name === 'opus' && gen.version >= 5.5));

const KNOWN_ANTHROPIC_PRICING: Record<
  string,
  {
    prompt: number;
    completion: number;
    inputCacheRead: number;
    inputCacheWrite: number;
    currency: string;
  }
> = {
  'claude-fable-5-1': {
    prompt: 0.00001,
    completion: 0.00005,
    inputCacheRead: 0.00000025,
    inputCacheWrite: 0.0000125,
    currency: 'usd',
  },
  'claude-opus-5-5': {
    prompt: 0.000004,
    completion: 0.00002,
    inputCacheRead: 0.0000002,
    inputCacheWrite: 0.000005,
    currency: 'usd',
  },
  'claude-opus-5': {
    prompt: 0.000005,
    completion: 0.000025,
    inputCacheRead: 0.0000005,
    inputCacheWrite: 0.00000625,
    currency: 'usd',
  },
  'claude-sonnet-5': {
    prompt: 0.000002,
    completion: 0.00001,
    inputCacheRead: 0.0000002,
    inputCacheWrite: 0.0000025,
    currency: 'usd',
  },
  'claude-fable-5': {
    prompt: 0.00001,
    completion: 0.00005,
    inputCacheRead: 0.000001,
    inputCacheWrite: 0.0000125,
    currency: 'usd',
  },
  'claude-opus-4-6': {
    prompt: 0.000005,
    completion: 0.000025,
    inputCacheRead: 0.0000005,
    inputCacheWrite: 0.00000625,
    currency: 'usd',
  },
  'claude-sonnet-4-6': {
    prompt: 0.000003,
    completion: 0.000015,
    inputCacheRead: 0.0000003,
    inputCacheWrite: 0.00000375,
    currency: 'usd',
  },
  'claude-haiku-4-5': {
    prompt: 0.000001,
    completion: 0.000005,
    inputCacheRead: 0.0000001,
    inputCacheWrite: 0.00000125,
    currency: 'usd',
  },
};

function normalizeSlug(model: string): string {
  let normalized = model.trim().toLowerCase();
  for (const prefix of ANTHROPIC_ACCEPTED_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length);
      break;
    }
  }
  return normalized;
}

export function normalizeAnthropicModelSlug(model: string): string {
  return normalizeSlug(model);
}

export function toAnthropicModelId(model: string): string {
  const normalized = normalizeSlug(model);
  return normalized ? `${ANTHROPIC_TRANSPORT_PREFIX}${normalized}` : model;
}

export function resolveAnthropicDirectModelId(model: string): string | undefined {
  const normalized = normalizeSlug(model);
  if (!normalized) return undefined;

  const mapped = ANTHROPIC_MODEL_ALIAS_MAP[normalized];
  if (mapped) return mapped;

  const dottedVariant = normalized.replace(/\./g, '-');
  const mappedDotted = ANTHROPIC_MODEL_ALIAS_MAP[dottedVariant];
  if (mappedDotted) return mappedDotted;

  if (SNAPSHOT_MODEL_ID_RE.test(normalized)) return normalized;
  if (SNAPSHOT_MODEL_ID_RE.test(dottedVariant)) return dottedVariant;

  return undefined;
}

export function resolveAnthropicPublicModelId(model: string): string {
  const normalized = normalizeSlug(model);
  if (!normalized) return model;
  const direct = resolveAnthropicDirectModelId(normalized);
  if (!direct) return normalized;
  return DIRECT_TO_PUBLIC_MODEL_MAP.get(direct) ?? direct;
}

export function getAnthropicPricing(model: string) {
  const publicId = resolveAnthropicPublicModelId(model);
  const normalized = normalizeSlug(publicId);
  return KNOWN_ANTHROPIC_PRICING[normalized];
}

const isMythosPreview = (model: string) => normalizeSlug(model) === 'claude-mythos-preview';

/** Every Claude 3 or later caches prompts. */
export function supportsAnthropicPromptCaching(model: string): boolean {
  const gen = claudeGeneration(normalizeSlug(model));
  return isMythosPreview(model) || (!!gen && gen.version >= 3);
}

export function supportsAnthropicAdaptiveThinking(model: string): boolean {
  return isMythosPreview(model) || isAdaptiveGeneration(claudeGeneration(normalizeSlug(model)));
}

export function isAnthropicThinkingMandatory(model: string): boolean {
  return isMythosPreview(model) || isThinkingAlwaysOn(claudeGeneration(normalizeSlug(model)));
}

/**
 * Documented effort levels for a model, weakest first: the fallback when the
 * models API response lacks `capabilities.effort`. `max` came with the 4.6
 * generation, `xhigh` with 4.7.
 */
export function documentedAnthropicEffortLevels(model: string): string[] {
  const levels = ['low', 'medium', 'high'];
  if (isMythosPreview(model)) return [...levels, 'max'];
  const gen = claudeGeneration(normalizeSlug(model));
  if (!isAdaptiveGeneration(gen)) return levels;
  if (gen && gen.version >= 4.7) levels.push('xhigh');
  levels.push('max');
  return levels;
}

export function supportsAnthropicReasoning(model: string): boolean {
  const normalized = normalizeSlug(model);
  return normalized.startsWith('claude-');
}

export function supportsAnthropicVision(model: string): boolean {
  const normalized = normalizeSlug(model);
  return normalized.startsWith('claude-');
}

export function supportsAnthropicToolUse(model: string): boolean {
  const normalized = normalizeSlug(model);
  return normalized.startsWith('claude-');
}

export function defaultAnthropicThinkingBudget(
  effort: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | undefined,
): number {
  if (effort === 'minimal' || effort === 'low') return 1024;
  if (effort === 'medium') return 2048;
  if (effort === 'xhigh' || effort === 'max') return 8192;
  return 4096;
}

export function sanitizeAnthropicModelId(model: string): string {
  return resolveAnthropicDirectModelId(model) ?? normalizeSlug(model);
}

export function readAnthropicCapabilityFlag(
  capabilities: unknown,
  ...names: string[]
): boolean | undefined {
  if (!isRecord(capabilities)) return undefined;
  for (const name of names) {
    const value = capabilities[name];
    if (typeof value === 'boolean') return value;
    if (isRecord(value)) {
      if (typeof value.supported === 'boolean') return value.supported;
      if (typeof value.enabled === 'boolean') return value.enabled;
      if (typeof value.available === 'boolean') return value.available;
    }
  }
  return undefined;
}
