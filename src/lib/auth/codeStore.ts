import { kv } from '@vercel/kv';

const CONSUMED_PREFIX = 'consumed:';

/**
 * Check if a code hash has been consumed (used).
 * Returns false if KV is not configured (allows local dev without KV).
 */
export async function isCodeConsumed(codeHash: string): Promise<boolean> {
  try {
    const result = await kv.get<boolean>(`${CONSUMED_PREFIX}${codeHash}`);
    return result === true;
  } catch (error) {
    // If KV is not configured, allow codes to work (for local dev)
    if (isKvNotConfigured(error)) {
      console.warn('[codeStore] Vercel KV not configured, skipping consumption check');
      return false;
    }
    throw error;
  }
}

/**
 * Mark a code hash as consumed.
 * No-op if KV is not configured (for local dev).
 */
export async function markCodeConsumed(codeHash: string): Promise<void> {
  try {
    await kv.set(`${CONSUMED_PREFIX}${codeHash}`, true);
  } catch (error) {
    if (isKvNotConfigured(error)) {
      console.warn('[codeStore] Vercel KV not configured, skipping consumption marking');
      return;
    }
    throw error;
  }
}

/**
 * Check if error indicates KV is not configured.
 */
function isKvNotConfigured(error: unknown): boolean {
  if (error instanceof Error) {
    // Vercel KV throws when env vars are missing
    return (
      error.message.includes('KV_REST_API_URL') ||
      error.message.includes('KV_REST_API_TOKEN') ||
      error.message.includes('UPSTASH') ||
      error.message.includes('Could not find')
    );
  }
  return false;
}
