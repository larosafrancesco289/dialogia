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
const PROMPT_CACHING_MODEL_ID_RE_LIST = [
  /^claude-mythos-preview$/,
  /^claude-opus-4(?:-\d{8}|-[0-9](?:-\d{8})?)?$/,
  /^claude-sonnet-4(?:-\d{8}|-[0-9](?:-\d{8})?)?$/,
  /^claude-sonnet-3-7(?:-\d{8}|-latest)?$/,
  /^claude-3-7-sonnet(?:-\d{8}|-latest)?$/,
  /^claude-haiku-4-5(?:-\d{8})?$/,
  /^claude-haiku-3-5(?:-\d{8}|-latest)?$/,
  /^claude-3-5-haiku(?:-\d{8}|-latest)?$/,
  /^claude-haiku-3(?:-\d{8}|-latest)?$/,
  /^claude-3-haiku(?:-\d{8}|-latest)?$/,
  /^claude-opus-3(?:-\d{8}|-latest)?$/,
  /^claude-3-opus(?:-\d{8}|-latest)?$/,
] as const;
const ADAPTIVE_THINKING_MODEL_ID_RE_LIST = [
  /^claude-opus-4-6(?:-\d{8})?$/,
  /^claude-opus-4-7(?:-\d{8})?$/,
  /^claude-sonnet-4-6(?:-\d{8})?$/,
  /^claude-mythos-preview$/,
] as const;

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

export function supportsAnthropicPromptCaching(model: string): boolean {
  const normalized = normalizeSlug(model).replace(/\./g, '-');
  return PROMPT_CACHING_MODEL_ID_RE_LIST.some((re) => re.test(normalized));
}

export function supportsAnthropicAdaptiveThinking(model: string): boolean {
  const normalized = normalizeSlug(model).replace(/\./g, '-');
  return ADAPTIVE_THINKING_MODEL_ID_RE_LIST.some((re) => re.test(normalized));
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
  effort: 'low' | 'medium' | 'high' | 'xhigh' | undefined,
): number {
  if (effort === 'low') return 1024;
  if (effort === 'medium') return 2048;
  if (effort === 'xhigh') return 8192;
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
