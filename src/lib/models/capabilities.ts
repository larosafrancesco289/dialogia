import type { ModelDescriptor, ReasoningEffort } from '@/lib/types';
import { ReasoningEffortEnum } from '@/lib/types';
import { isRecord } from '@/lib/utils/guards';

const toLowerStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((entry) => String(entry).toLowerCase()) : [];

export type ModelCapabilityFlags = {
  canReason: boolean;
  canSee: boolean;
  canAudio: boolean;
  canImageOut: boolean;
};

export function getSupportedParameters(model?: ModelDescriptor | null): string[] {
  const raw = isRecord(model?.raw) ? model?.raw : undefined;
  const params: unknown = raw?.supported_parameters;
  if (Array.isArray(params)) return params.map((p) => String(p).toLowerCase());
  return [];
}

export function isReasoningSupported(model?: ModelDescriptor | null): boolean {
  const supported = getSupportedParameters(model);
  if (supported.includes('reasoning')) return true;
  // Some providers expose only include_reasoning; that does not imply effort support
  // Keep this strict to avoid sending unsupported params.
  return false;
}

/** Effort levels the OpenRouter gateway accepts, weakest to strongest. */
export const REASONING_EFFORT_ORDER: ReasoningEffort[] = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];

const isKnownEffort = (value: unknown): value is ReasoningEffort =>
  Object.values(ReasoningEffortEnum).includes(value as ReasoningEffort);

export type ModelReasoningInfo = {
  /**
   * Effort levels the provider reports for this model, ascending.
   * `undefined` means the metadata did not constrain them (all gateway
   * values accepted) or the model exposes no reasoning object at all.
   */
  supportedEfforts?: ReasoningEffort[];
  /** Effort the provider pre-selects when reasoning is enabled. */
  defaultEffort?: ReasoningEffort;
  /** Whether the provider enables reasoning by default for this model. */
  defaultEnabled?: boolean;
  /** When true, reasoning cannot be disabled (e.g. Claude Fable 5). */
  mandatory?: boolean;
  supportsMaxTokens?: boolean;
};

/**
 * Normalized view of the per-model `reasoning` metadata object (OpenRouter
 * models-list shape; the Anthropic transport synthesizes the same shape).
 * Returns undefined when the model carries no reasoning metadata.
 */
export function getModelReasoningInfo(
  model?: ModelDescriptor | null,
): ModelReasoningInfo | undefined {
  const raw = isRecord(model?.raw) ? model.raw : undefined;
  const reasoning = isRecord(raw?.reasoning) ? raw.reasoning : undefined;
  if (!reasoning) return undefined;
  const rawEfforts = reasoning.supported_efforts;
  const supportedEfforts = Array.isArray(rawEfforts)
    ? REASONING_EFFORT_ORDER.filter((effort) =>
        rawEfforts.some((value) => String(value).toLowerCase() === effort),
      )
    : undefined;
  return {
    supportedEfforts:
      supportedEfforts && supportedEfforts.length > 0 ? supportedEfforts : undefined,
    defaultEffort: isKnownEffort(reasoning.default_effort) ? reasoning.default_effort : undefined,
    defaultEnabled:
      typeof reasoning.default_enabled === 'boolean' ? reasoning.default_enabled : undefined,
    mandatory: typeof reasoning.mandatory === 'boolean' ? reasoning.mandatory : undefined,
    supportsMaxTokens:
      typeof reasoning.supports_max_tokens === 'boolean'
        ? reasoning.supports_max_tokens
        : undefined,
  };
}

// Legacy fallback for stale metadata that predates the `reasoning` object.
const XHIGH_MODEL_ID_PATTERNS: RegExp[] = [
  /^(?:anthropic-direct\/|anthropic\/)?claude-fable-5(?:-\d{8})?$/,
  /^(?:anthropic-direct\/|anthropic\/)?claude-opus-4[.-](?:7|8)(?:-\d{8})?$/,
  /^openai\/gpt-5[.-](?:2|3|4)/,
];

const LEGACY_EFFORTS: ReasoningEffort[] = ['none', 'low', 'medium', 'high'];

/**
 * Effort levels selectable for this model, ascending, always including
 * 'none' unless the provider marks reasoning as mandatory.
 */
export function getSelectableReasoningEfforts(model?: ModelDescriptor | null): ReasoningEffort[] {
  if (!isReasoningSupported(model)) return [];
  const info = getModelReasoningInfo(model);
  const base: ReasoningEffort[] = info?.supportedEfforts
    ? info.supportedEfforts.filter((effort) => effort !== 'none')
    : info
      ? REASONING_EFFORT_ORDER.filter((effort) => effort !== 'none')
      : [
          ...LEGACY_EFFORTS.filter((effort) => effort !== 'none'),
          ...(legacySupportsXhigh(model) ? (['xhigh'] as ReasoningEffort[]) : []),
        ];
  const withNone = info?.mandatory ? base : (['none', ...base] as ReasoningEffort[]);
  return REASONING_EFFORT_ORDER.filter((effort) => withNone.includes(effort));
}

// Model authors' documented defaults, which take precedence over a gateway's
// own default_effort. OpenRouter publishes default_effort "medium" for Claude
// models, but Anthropic's effort docs state the API default is "high" on all
// effort-capable models (Fable/Mythos, Opus 4.6+, Sonnet 4.6+, Sonnet 5).
const AUTHOR_DEFAULT_EFFORT_OVERRIDES: Array<{ pattern: RegExp; effort: ReasoningEffort }> = [
  { pattern: /claude-(fable|mythos)/, effort: 'high' },
  { pattern: /claude-opus-4[.-][678]/, effort: 'high' },
  { pattern: /claude-sonnet-(5|4[.-]6)/, effort: 'high' },
];

function documentedAuthorDefaultEffort(
  model?: ModelDescriptor | null,
): ReasoningEffort | undefined {
  const id = String(model?.id || '').toLowerCase();
  return AUTHOR_DEFAULT_EFFORT_OVERRIDES.find(({ pattern }) => pattern.test(id))?.effort;
}

/** Provider default effort when the user has not chosen one. */
export function getDefaultReasoningEffort(
  model?: ModelDescriptor | null,
): ReasoningEffort | undefined {
  const info = getModelReasoningInfo(model);
  if (!info) return undefined;
  if (info.defaultEnabled === false && !info.mandatory) return 'none';
  return documentedAuthorDefaultEffort(model) ?? info.defaultEffort;
}

export function isReasoningMandatory(model?: ModelDescriptor | null): boolean {
  return getModelReasoningInfo(model)?.mandatory === true;
}

/**
 * Clamp an effort to the nearest level the model supports (preferring the
 * next level down). Returns the input unchanged when support is unknown.
 */
export function clampReasoningEffort(
  effort: ReasoningEffort,
  model?: ModelDescriptor | null,
): ReasoningEffort {
  const selectable = getSelectableReasoningEfforts(model);
  if (selectable.length === 0 || selectable.includes(effort)) return effort;
  const target = REASONING_EFFORT_ORDER.indexOf(effort);
  let below: ReasoningEffort | undefined;
  let above: ReasoningEffort | undefined;
  for (const candidate of selectable) {
    const index = REASONING_EFFORT_ORDER.indexOf(candidate);
    if (index < target) below = candidate;
    if (index > target && !above) above = candidate;
  }
  // 'none' is a request to disable reasoning, not a weak effort — never
  // resolve another effort down to it.
  if (below && below !== 'none') return below;
  return above ?? effort;
}

function legacySupportsXhigh(model?: ModelDescriptor | null): boolean {
  const supported = getSupportedParameters(model);
  if (supported.includes('reasoning_effort_xhigh') || supported.includes('xhigh')) return true;
  const id = String(model?.id || '').toLowerCase();
  return XHIGH_MODEL_ID_PATTERNS.some((re) => re.test(id));
}

export function supportsXhighReasoningEffort(model?: ModelDescriptor | null): boolean {
  if (!isReasoningSupported(model)) return false;
  const info = getModelReasoningInfo(model);
  if (info) {
    if (info.supportedEfforts) return info.supportedEfforts.includes('xhigh');
    // Reasoning object present with unconstrained efforts: all gateway values accepted.
    return true;
  }
  return legacySupportsXhigh(model);
}

const KNOWN_TOOL_CALLING_PROVIDERS = ['anthropic/', 'openai/', 'google/', 'x-ai/', 'meta-llama/'];

export function isToolCallingSupported(model?: ModelDescriptor | null): boolean {
  const supported = getSupportedParameters(model);
  if (supported.includes('tools')) return true;
  // Fallback: known providers always support tool calling even if metadata is missing
  const id = String(model?.id || '').toLowerCase();
  if (KNOWN_TOOL_CALLING_PROVIDERS.some((prefix) => id.startsWith(prefix))) return true;
  return false;
}

export function isVisionSupported(model?: ModelDescriptor | null): boolean {
  const supported = getSupportedParameters(model);
  // Primary signal from OpenRouter metadata
  if (supported.includes('vision') || supported.includes('image') || supported.includes('images'))
    return true;
  // Fallback heuristics for providers that omit supported_parameters details
  const raw: Record<string, unknown> = isRecord(model?.raw)
    ? (model.raw as Record<string, unknown>)
    : {};
  const architecture = isRecord(raw.architecture) ? raw.architecture : undefined;
  const id = String(model?.id || '').toLowerCase();
  const name = String(model?.name || '').toLowerCase();
  const hay = `${id} ${name}`;
  const caps = toLowerStrings(raw.capabilities);
  // OpenRouter typically nests modality info under `architecture` for many models
  const modalityStr = String((raw.modality ?? architecture?.modality) || '').toLowerCase();
  const modalities = toLowerStrings(raw.modalities ?? architecture?.modalities);
  const inputModalities = toLowerStrings(raw.input_modalities ?? architecture?.input_modalities);
  if (caps.some((c: string) => c.includes('vision') || c.includes('image'))) return true;
  if (
    modalityStr.includes('vision') ||
    modalityStr.includes('image') ||
    modalityStr.includes('multi')
  )
    return true;
  if (inputModalities.some((m: string) => m.includes('image'))) return true;
  if (modalities.some((m: string) => m.includes('image') || m.includes('vision'))) return true;
  // Last-resort name/id hints for popular vision families
  if (/\b(vision|4o|omni)\b/.test(hay)) return true;
  return false;
}

// Whether a model supports audio inputs (input_audio content blocks)
export function isAudioInputSupported(model?: ModelDescriptor | null): boolean {
  const supported = getSupportedParameters(model);
  if (supported.includes('audio')) return true;
  // Heuristics from raw metadata when supported_parameters is sparse
  const raw: Record<string, unknown> = isRecord(model?.raw)
    ? (model.raw as Record<string, unknown>)
    : {};
  const architecture = isRecord(raw.architecture) ? raw.architecture : undefined;
  const id = String(model?.id || '').toLowerCase();
  const name = String(model?.name || '').toLowerCase();
  const hay = `${id} ${name}`;
  const modalities = toLowerStrings(raw.modalities ?? architecture?.modalities);
  const inputModalities = toLowerStrings(raw.input_modalities ?? architecture?.input_modalities);
  if (inputModalities.some((m: string) => m.includes('audio'))) return true;
  if (modalities.some((m: string) => m.includes('audio'))) return true;
  // Last-resort hints for popular audio-capable families
  if (/\b(gemini|gpt|omni|4o|flash)\b/.test(hay)) {
    // Do not over-claim; only return true if raw flags suggest multimodality
    const modalityStr = String((raw.modality ?? architecture?.modality) || '').toLowerCase();
    if (modalityStr.includes('audio') || modalityStr.includes('multi')) return true;
  }
  return false;
}

// Whether a model can output images (for image generation)
export function isImageOutputSupported(model?: ModelDescriptor | null): boolean {
  if (!model) return false;
  const raw: Record<string, unknown> = isRecord(model.raw)
    ? (model.raw as Record<string, unknown>)
    : {};
  const architecture = isRecord(raw.architecture) ? raw.architecture : undefined;
  const outMods: unknown[] = Array.isArray(raw.output_modalities)
    ? raw.output_modalities
    : Array.isArray(architecture?.output_modalities)
      ? architecture?.output_modalities
      : [];
  const norm = (arr: unknown[]) => arr.map((x) => String(x || '').toLowerCase());
  const out = norm(outMods);
  if (out.some((m) => m.includes('image'))) return true;
  // Fallbacks for providers that only expose a single modalities field
  const modalities: unknown[] = Array.isArray(raw.modalities)
    ? raw.modalities
    : Array.isArray(architecture?.modalities)
      ? architecture?.modalities
      : [];
  const mod = norm(modalities);
  if (mod.some((m) => m.includes('image'))) return true;
  // Last resort: name/id hints for known image-gen previews
  const hay = `${String(model.id || '')} ${String(model.name || '')}`.toLowerCase();
  if (/(image|flash-image|diffusion)/.test(hay)) return true;
  return false;
}

export const EMPTY_MODEL_CAPABILITIES: ModelCapabilityFlags = {
  canReason: false,
  canSee: false,
  canAudio: false,
  canImageOut: false,
};

export function getModelCapabilities(model?: ModelDescriptor | null): ModelCapabilityFlags {
  if (!model) return EMPTY_MODEL_CAPABILITIES;
  return {
    canReason: isReasoningSupported(model),
    canSee: isVisionSupported(model),
    canAudio: isAudioInputSupported(model),
    canImageOut: isImageOutputSupported(model),
  } satisfies ModelCapabilityFlags;
}
