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

export function findModelById(models: ORModel[] | undefined, id?: string): ORModel | undefined {
  if (!models || !id) return undefined;
  return models.find((m) => m.id === id);
}
