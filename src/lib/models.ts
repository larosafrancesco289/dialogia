import type { ORModel } from '@/lib/types';

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
  model?: ORModel | null;
  fallbackId?: string;
  fallbackName?: string;
}): string {
  const { model, fallbackId, fallbackName } = params;
  const rawName =
    model && model.raw && typeof (model.raw as any).name === 'string'
      ? ((model.raw as any).name as string)
      : undefined;
  const rawInfo = model && model.raw ? (model.raw as any).info : undefined;
  const infoDisplay =
    rawInfo && typeof rawInfo.display === 'string' ? (rawInfo.display as string) : undefined;
  const infoName =
    rawInfo && typeof rawInfo.name === 'string' ? (rawInfo.name as string) : undefined;
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

export function getSupportedParameters(model?: ORModel | null): string[] {
  const raw = (model as any)?.raw || {};
  const params: unknown = raw?.supported_parameters;
  if (Array.isArray(params)) return params.map((p) => String(p).toLowerCase());
  return [];
}

export function isReasoningSupported(model?: ORModel | null): boolean {
  const supported = getSupportedParameters(model);
  if (supported.includes('reasoning')) return true;
  // Some providers expose only include_reasoning; that does not imply effort support
  // Keep this strict to avoid sending unsupported params.
  return false;
}

export function isToolCallingSupported(model?: ORModel | null): boolean {
  const supported = getSupportedParameters(model);
  return supported.includes('tools');
}

export function isVisionSupported(model?: ORModel | null): boolean {
  const supported = getSupportedParameters(model);
  // Primary signal from OpenRouter metadata
  if (supported.includes('vision') || supported.includes('image') || supported.includes('images'))
    return true;
  // Fallback heuristics for providers that omit supported_parameters details
  const raw: any = (model as any)?.raw || {};
  const id = String((model as any)?.id || '').toLowerCase();
  const name = String((model as any)?.name || '').toLowerCase();
  const hay = `${id} ${name}`;
  const caps = Array.isArray(raw?.capabilities)
    ? raw.capabilities.map((c: any) => String(c).toLowerCase())
    : [];
  // OpenRouter typically nests modality info under `architecture` for many models
  const modalityStr = String((raw?.modality ?? raw?.architecture?.modality) || '').toLowerCase();
  const modalities = Array.isArray(raw?.modalities)
    ? raw.modalities.map((m: any) => String(m).toLowerCase())
    : [];
  const inputModalities = Array.isArray(raw?.input_modalities)
    ? raw.input_modalities.map((m: any) => String(m).toLowerCase())
    : Array.isArray(raw?.architecture?.input_modalities)
      ? raw.architecture.input_modalities.map((m: any) => String(m).toLowerCase())
      : [];
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
export function isAudioInputSupported(model?: ORModel | null): boolean {
  const supported = getSupportedParameters(model);
  if (supported.includes('audio')) return true;
  // Heuristics from raw metadata when supported_parameters is sparse
  const raw: any = (model as any)?.raw || {};
  const id = String((model as any)?.id || '').toLowerCase();
  const name = String((model as any)?.name || '').toLowerCase();
  const hay = `${id} ${name}`;
  const modalities = Array.isArray(raw?.modalities)
    ? raw.modalities.map((m: any) => String(m).toLowerCase())
    : Array.isArray(raw?.architecture?.modalities)
      ? raw.architecture.modalities.map((m: any) => String(m).toLowerCase())
      : [];
  const inputModalities = Array.isArray(raw?.input_modalities)
    ? raw.input_modalities.map((m: any) => String(m).toLowerCase())
    : Array.isArray(raw?.architecture?.input_modalities)
      ? raw.architecture.input_modalities.map((m: any) => String(m).toLowerCase())
      : [];
  if (inputModalities.some((m: string) => m.includes('audio'))) return true;
  if (modalities.some((m: string) => m.includes('audio'))) return true;
  // Last-resort hints for popular audio-capable families
  if (/\b(gemini|gpt|omni|4o|flash)\b/.test(hay)) {
    // Do not over-claim; only return true if raw flags suggest multimodality
    const modalityStr = String((raw?.modality ?? raw?.architecture?.modality) || '').toLowerCase();
    if (modalityStr.includes('audio') || modalityStr.includes('multi')) return true;
  }
  return false;
}

// Whether a model can output images (for image generation)
export function isImageOutputSupported(model?: ORModel | null): boolean {
  if (!model) return false;
  const raw: any = (model as any)?.raw || {};
  const outMods: string[] = Array.isArray(raw?.output_modalities)
    ? raw.output_modalities
    : Array.isArray(raw?.architecture?.output_modalities)
      ? raw.architecture.output_modalities
      : [];
  const norm = (arr: any[]) => arr.map((x) => String(x || '').toLowerCase());
  const out = norm(outMods);
  if (out.some((m) => m.includes('image'))) return true;
  // Fallbacks for providers that only expose a single modalities field
  const modalities: string[] = Array.isArray(raw?.modalities)
    ? raw.modalities
    : Array.isArray(raw?.architecture?.modalities)
      ? raw.architecture.modalities
      : [];
  const mod = norm(modalities);
  if (mod.some((m) => m.includes('image'))) return true;
  // Last resort: name/id hints for known image-gen previews
  const hay = `${String(model.id || '')} ${String(model.name || '')}`.toLowerCase();
  if (/(image|flash-image|diffusion)/.test(hay)) return true;
  return false;
}

export function findModelById(models: ORModel[] | undefined, id?: string): ORModel | undefined {
  if (!models || !id) return undefined;
  return models.find((m) => m.id === id);
}
