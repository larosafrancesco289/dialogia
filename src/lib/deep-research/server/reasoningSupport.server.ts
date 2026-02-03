import 'server-only';

import { fetchModels } from '@/lib/openrouter';
import type { TransportAuth } from '@/lib/auth/transport';
import { isRecord } from '@/lib/utils/guards';

const REASONING_SUPPORT_TTL_MS = 5 * 60 * 1000;
const reasoningSupportCache = new Map<string, { ok: boolean; expiresAt: number }>();

export async function getReasoningSupport(
  auth: TransportAuth,
  modelId: string,
  origin: string,
): Promise<boolean> {
  const key = `${origin}:${modelId.toLowerCase()}`;
  const cached = reasoningSupportCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.ok;

  try {
    const models = await fetchModels(auth, { origin });
    const entry = models.find((m) => m.id.toLowerCase() === modelId.toLowerCase());
    const raw = isRecord(entry?.raw) ? entry?.raw : undefined;
    const supported = Array.isArray(raw?.supported_parameters)
      ? raw.supported_parameters.map((p) => String(p).toLowerCase())
      : [];
    const ok = supported.includes('reasoning');
    reasoningSupportCache.set(key, { ok, expiresAt: Date.now() + REASONING_SUPPORT_TTL_MS });
    return ok;
  } catch {
    if (cached) return cached.ok;
    return false;
  }
}
