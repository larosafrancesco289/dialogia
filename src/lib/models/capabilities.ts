import type { ModelDescriptor } from '@/lib/types';
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

export function isToolCallingSupported(model?: ModelDescriptor | null): boolean {
  const supported = getSupportedParameters(model);
  if (supported.includes('tools')) return true;
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
