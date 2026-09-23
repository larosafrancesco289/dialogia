import type { ModelDescriptor } from '@/lib/types';
import { isRecord } from '@/lib/utils/guards';

export function stripProviderPrefix(label?: string): string {
  return String(label ?? '')
    .replace(/^[^:]+:\s*/, '')
    .trim();
}

const ACRONYMS: Record<string, string> = { gpt: 'GPT', glm: 'GLM', ai: 'AI', oss: 'OSS' };

/**
 * A readable name for a model known only by its id, for when the model list
 * has not loaded or no longer carries it: `anthropic/claude-opus-5-5` reads
 * "Claude Opus 5.5", `openai/gpt-5.5` reads "GPT-5.5".
 */
export function deriveNameFromId(id?: string): string {
  if (!id) return '';
  const segment = (id.includes('/') ? (id.split('/').pop() ?? id) : id).replace(/^~/, '');
  const tokens = segment.split(/[-_\s]+/).filter(Boolean);
  const merged: string[] = [];
  for (const token of tokens) {
    const prev = merged[merged.length - 1];
    // "5-5" is a version number, not two words.
    if (prev && /^\d{1,2}$/.test(prev) && /^\d{1,2}$/.test(token)) {
      merged[merged.length - 1] = `${prev}.${token}`;
    } else {
      merged.push(token);
    }
  }
  const words = merged.map((token) => {
    const lower = token.toLowerCase();
    if (ACRONYMS[lower]) return ACRONYMS[lower];
    if (/^\d+[bkm]$/i.test(token)) return token.toUpperCase();
    return /^[a-z]/.test(token) ? token[0].toUpperCase() + token.slice(1) : token;
  });
  const name = words.join(' ').replace(/^GPT (?=\d)/, 'GPT-');
  return name || segment;
}

const looksLikeId = (value: string) => /^[~\w.:-]+\/[\w.:-]+$/.test(value);

export function formatModelLabel(params: {
  model?: ModelDescriptor | null;
  fallbackId?: string;
  fallbackName?: string;
}): string {
  const { model, fallbackId, fallbackName } = params;
  const raw = isRecord(model?.raw) ? model?.raw : undefined;
  const rawName = typeof raw?.name === 'string' ? raw.name : undefined;
  const rawInfo = isRecord(raw?.info) ? raw.info : undefined;
  const infoDisplay = typeof rawInfo?.display === 'string' ? rawInfo.display : undefined;
  const infoName = typeof rawInfo?.name === 'string' ? rawInfo.name : undefined;
  const candidates = [model?.name, rawName, infoDisplay, infoName, fallbackName];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    if (trimmed.toLowerCase() === 'free') continue;
    if (looksLikeId(trimmed)) return deriveNameFromId(trimmed);
    return stripProviderPrefix(trimmed);
  }
  const idSource = fallbackId || model?.id;
  const derived = deriveNameFromId(idSource);
  return derived || 'Pick model';
}
