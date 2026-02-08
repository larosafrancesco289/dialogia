/**
 * OpenRouter API key resolution utilities.
 *
 * Separated from server.ts so CLI scripts (ablation runner, tutor simulation, etc.)
 * can read API keys from process.env without triggering the 'server-only' guard
 * that server.ts enforces for Next.js Server Components.
 */

import { readEnvValue } from '@/lib/env/values';

export function getOpenRouterKeyFallback(): string | undefined {
  return (
    readEnvValue(process.env.OPENROUTER_API_KEY) ||
    readEnvValue(process.env.NEXT_PUBLIC_OPENROUTER_API_KEY) ||
    readEnvValue(process.env.OPENROUTER_KEY)
  );
}
