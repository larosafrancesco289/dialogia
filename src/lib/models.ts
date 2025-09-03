import type { ORModel } from '@/lib/types';

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
  const modalityStr = String(raw?.modality || '').toLowerCase();
  const modalities = Array.isArray(raw?.modalities)
    ? raw.modalities.map((m: any) => String(m).toLowerCase())
    : [];
  if (caps.some((c: string) => c.includes('vision') || c.includes('image'))) return true;
  if (
    modalityStr.includes('vision') ||
    modalityStr.includes('image') ||
    modalityStr.includes('multi')
  )
    return true;
  if (modalities.some((m: string) => m.includes('image') || m.includes('vision'))) return true;
  // Last-resort name/id hints for popular vision families
  if (/\b(vision|4o|omni)\b/.test(hay)) return true;
  return false;
}

export function findModelById(models: ORModel[] | undefined, id?: string): ORModel | undefined {
  if (!models || !id) return undefined;
  return models.find((m) => m.id === id);
}
