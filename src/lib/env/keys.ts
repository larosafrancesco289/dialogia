/**
 * OpenRouter API key resolution utilities.
 *
 * Separated from server.ts so CLI scripts (tutor simulation, etc.) can read API
 * keys straight from process.env without pulling in the hosted server env layer.
 */

import { readEnvValue } from '@/lib/env/values';

export function getOpenRouterKeyFallback(): string | undefined {
  return (
    readEnvValue(process.env.OPENROUTER_API_KEY) ||
    readEnvValue(process.env.VITE_OPENROUTER_API_KEY) ||
    readEnvValue(process.env.OPENROUTER_KEY)
  );
}

export function getAnthropicKeyFallback(): string | undefined {
  return readEnvValue(process.env.ANTHROPIC_API_KEY);
}
