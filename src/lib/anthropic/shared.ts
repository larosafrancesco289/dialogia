import { isRecord } from '@/lib/utils/guards';

export const ANTHROPIC_API_VERSION = '2023-06-01';
export const ANTHROPIC_MIN_THINKING_BUDGET = 1024;
// What a reply keeps for its words once thinking has had its budget: the API
// rejects a budget that is not below max_tokens.
export const ANTHROPIC_MIN_ANSWER_TOKENS = 1024;
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

// From Claude 5 on, adaptive thinking runs when a request leaves `thinking`
// out; before it, thinking is off unless asked for (Anthropic's thinking table).
const isThinkingOnByDefault = (gen: ClaudeGeneration | undefined): boolean =>
  !!gen && gen.version >= 5;

/**
 * What the Models API says about a model, where it says it: its `line`, and
 * the capability flags Anthropic tells clients to read instead of guessing
 * from the id. Every field is undefined when the response left it out (an
 * older response, or a model the list has not been loaded for), and the id
 * rules answer then.
 */
export type AnthropicModelFacts = {
  /** `line`: opus, sonnet, haiku, fable, mythos, or more to come. */
  line?: string;
  /** `capabilities.thinking.types.disabled`: false exactly when "disabled" is a 400. */
  thinkingOff?: boolean;
  /** `capabilities.thinking.types.adaptive`. */
  adaptiveThinking?: boolean;
  /** `capabilities.thinking.types.enabled`: manual thinking with a budget. */
  budgetThinking?: boolean;
  /** `capabilities.server_tools.web_search`: some version of the tool is accepted. */
  webSearch?: boolean;
  /**
   * `capabilities.code_execution`: code the model runs can call the request's
   * other tools, which web search's dynamic filtering needs.
   */
  codeCallsTools?: boolean;
};

/** A nested capability's `supported` flag, or undefined when the path is not there. */
function capabilityAt(capabilities: unknown, ...path: string[]): boolean | undefined {
  let value: unknown = capabilities;
  for (const key of path) {
    if (!isRecord(value)) return undefined;
    value = value[key];
  }
  return isRecord(value) && typeof value.supported === 'boolean' ? value.supported : undefined;
}

/** The facts in one Models API entry. */
export function readAnthropicModelFacts(entry: Record<string, unknown>): AnthropicModelFacts {
  const caps = entry.capabilities;
  const facts: AnthropicModelFacts = {
    line: typeof entry.line === 'string' && entry.line ? entry.line : undefined,
    thinkingOff: capabilityAt(caps, 'thinking', 'types', 'disabled'),
    adaptiveThinking: capabilityAt(caps, 'thinking', 'types', 'adaptive'),
    budgetThinking: capabilityAt(caps, 'thinking', 'types', 'enabled'),
    webSearch: capabilityAt(caps, 'server_tools', 'web_search'),
    codeCallsTools: capabilityAt(caps, 'code_execution'),
  };
  return Object.fromEntries(
    Object.entries(facts).filter(([, value]) => value !== undefined),
  ) as AnthropicModelFacts;
}

// Filled as the model list loads; the request path is synchronous and reads it here.
const modelFacts = new Map<string, AnthropicModelFacts>();

const factsKey = (model: string) => resolveAnthropicDirectModelId(model) ?? normalizeSlug(model);

export function rememberAnthropicModelFacts(model: string, facts: AnthropicModelFacts): void {
  modelFacts.set(factsKey(model), facts);
}

function factsFor(model: string): AnthropicModelFacts | undefined {
  return modelFacts.get(factsKey(model));
}

/** @internal Test seam: forgets every model's facts. */
export function resetAnthropicModelFactsForTest(): void {
  modelFacts.clear();
}

/**
 * The model's generation: its version from the id, and its line from the
 * Models API when the list said, which Anthropic asks clients to read rather
 * than infer from the id.
 */
function generationOf(model: string): ClaudeGeneration | undefined {
  const gen = claudeGeneration(normalizeSlug(model));
  const line = factsFor(model)?.line;
  return gen && line ? { ...gen, name: line } : gen;
}

const KNOWN_ANTHROPIC_PRICING: Record<
  string,
  {
    prompt: number;
    completion: number;
    inputCacheRead: number;
    inputCacheWrite: number;
    currency: string;
    longPrompt?: { above: number; multiplier: number };
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
  'claude-sonnet-5-5': {
    prompt: 0.000002,
    completion: 0.00001,
    inputCacheRead: 0.0000001,
    inputCacheWrite: 0.0000025,
    currency: 'usd',
  },
  'claude-haiku-5-5': {
    prompt: 0.0000001,
    completion: 0.0000005,
    inputCacheRead: 0.00000001,
    inputCacheWrite: 0.000000125,
    currency: 'usd',
    // Over 100k prompt tokens, input, output and cache all cost five times as much.
    longPrompt: { above: 100_000, multiplier: 5 },
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
  const gen = generationOf(model);
  return isMythosPreview(model) || (!!gen && gen.version >= 3);
}

export function supportsAnthropicAdaptiveThinking(model: string): boolean {
  return (
    factsFor(model)?.adaptiveThinking ??
    (isMythosPreview(model) || isAdaptiveGeneration(generationOf(model)))
  );
}

/**
 * Whether a request thinks on a budget the chat sets: on the models that
 * predate adaptive thinking. Opus 4.6 and Sonnet 4.6 still take a budget, but
 * deprecated, so they are sent adaptive thinking and the budget is not offered.
 */
export function supportsAnthropicBudgetThinking(model: string): boolean {
  return !supportsAnthropicAdaptiveThinking(model) && factsFor(model)?.budgetThinking !== false;
}

// Claude Sonnet 5.5 refuses "disabled" and takes "between_tools" instead. The
// Models API has no flag for it, so this one stays a rule on the generation.
const takesBetweenTools = (gen: ClaudeGeneration | undefined): boolean =>
  !!gen && gen.name === 'sonnet' && gen.version >= 5.5;

/**
 * Whether nothing a request sends turns thinking off. The Models API says
 * when a model refuses "disabled"; one that takes "between_tools" instead
 * can still turn up-front thinking off.
 */
export function isAnthropicThinkingMandatory(model: string): boolean {
  const off = factsFor(model)?.thinkingOff;
  if (off !== undefined) return !off && !takesBetweenTools(generationOf(model));
  return isMythosPreview(model) || isThinkingAlwaysOn(generationOf(model));
}

/**
 * How a request turns thinking off, or undefined when leaving `thinking` out
 * already does (before Claude 5) or nothing can (Fable, Mythos, Opus 5.5).
 * Claude Sonnet 5.5 refuses "disabled" and takes "between_tools" instead.
 * A model the Models API says accepts "disabled" is sent it unless thinking
 * is off without it; one it says refuses it is never sent it.
 */
export function anthropicThinkingOff(
  model: string,
): { type: 'disabled' } | { type: 'between_tools' } | undefined {
  if (isAnthropicThinkingMandatory(model)) return undefined;
  const gen = generationOf(model);
  if (takesBetweenTools(gen)) return { type: 'between_tools' };
  const accepted = factsFor(model)?.thinkingOff;
  if (accepted === false) return undefined;
  // An id this client cannot read, which the API says takes "disabled", may
  // think by default: saying so costs nothing.
  if (!isThinkingOnByDefault(gen) && !(accepted && !gen)) return undefined;
  return { type: 'disabled' };
}

/**
 * The effort the API runs at when a request omits it: "high" on every
 * effort-capable model except Claude Opus 5.5 and Claude Haiku 5.5, which
 * default to "medium" (Anthropic's effort docs).
 */
export function documentedAnthropicDefaultEffort(model: string): 'medium' | 'high' {
  const gen = generationOf(model);
  const mediumByDefault =
    !!gen && (gen.name === 'opus' || gen.name === 'haiku') && gen.version >= 5.5;
  return mediumByDefault ? 'medium' : 'high';
}

/**
 * Documented effort levels for a model, weakest first: the fallback when the
 * models API response lacks `capabilities.effort`. `max` came with the 4.6
 * generation, `xhigh` with 4.7.
 */
export function documentedAnthropicEffortLevels(model: string): string[] {
  const levels = ['low', 'medium', 'high'];
  if (isMythosPreview(model)) return [...levels, 'max'];
  const gen = generationOf(model);
  if (!isAdaptiveGeneration(gen)) return levels;
  if (gen && gen.version >= 4.7) levels.push('xhigh');
  levels.push('max');
  return levels;
}

/**
 * The max_tokens a request sends when the chat sets none. The API has no
 * default and rejects a value above the model's output limit, so this is the
 * most every model of the generation allows: 32000 from Claude 3.7 on (Opus
 * 4 and 4.1 stop there), 8192 on 3.5, 4096 on Claude 3. A small default cut
 * long answers short and left no room beside a thinking budget.
 */
export function defaultAnthropicMaxTokens(model: string): number {
  const gen = generationOf(model);
  if (gen && gen.version < 3.5) return 4096;
  if (gen && gen.version < 3.7) return 8192;
  return 32000;
}

/**
 * Whether the model rejects any non-default temperature, top_p or top_k on
 * every request, thinking or not: Claude 5 on, Opus from 4.7, and the Mythos
 * class (Anthropic's thinking docs, "Sampling parameters").
 */
export function isAnthropicSamplingFixed(model: string): boolean {
  if (isMythosPreview(model)) return true;
  const gen = generationOf(model);
  if (!gen) return false;
  return gen.version >= 5 || gen.name === 'mythos' || (gen.name === 'opus' && gen.version >= 4.7);
}

/** Opus 4.1 on refuses a request that sets both temperature and top_p. */
export function anthropicTakesOneSampler(model: string): boolean {
  const gen = generationOf(model);
  return !!gen && gen.version >= 4.1;
}

/**
 * Whether the model binds a signed thinking block to everything sent before
 * it (the system prompt, the tools and every earlier message), so a request
 * that changed any of them and sends the block back fails. Claude Fable 5.1
 * and later run the check; Mythos 5.1 and every earlier model do not
 * (Anthropic's preserved-thinking docs).
 */
export function anthropicBindsThinkingToPrefix(model: string): boolean {
  const gen = generationOf(model);
  return !!gen && gen.name !== 'mythos' && gen.version >= 5.1;
}

/**
 * How a request offers the model web search:
 * - `filtered`: the current tool as it comes, which lets the model filter the
 *   results in code before they reach its context ("dynamic filtering"), on
 *   models whose code can call other tools: Claude 4.6 on and the Mythos class.
 * - `direct`: the current tool limited to direct calls, which a model without
 *   that ability needs (Claude Haiku 4.5, say), or the API returns a 400.
 * - `basic`: the original tool, for models older than the current one's.
 * - `none`: the Models API says the model takes no web search tool at all.
 * The Models API's flags decide where the list gave them.
 */
export function anthropicWebSearchMode(model: string): 'filtered' | 'direct' | 'basic' | 'none' {
  const facts = factsFor(model);
  if (facts?.webSearch === false) return 'none';
  if (facts?.codeCallsTools === true) return 'filtered';
  const gen = generationOf(model);
  const filters = isMythosPreview(model) || (!!gen && gen.version >= 4.6);
  if (filters && facts?.codeCallsTools !== false) return 'filtered';
  if (filters || (!!gen && gen.version >= 4.5)) return 'direct';
  return 'basic';
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
