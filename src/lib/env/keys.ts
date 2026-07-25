/**
 * OpenRouter API key resolution utilities.
 *
 * Separated from server.ts so CLI scripts (tutor simulation, etc.) can read API
 * keys straight from process.env without pulling in the hosted server env layer.
 */

import { readServerEnvValue } from '@/lib/env/source';

export function getOpenRouterKeyFallback(): string | undefined {
  return (
    readServerEnvValue('OPENROUTER_API_KEY') ||
    readServerEnvValue('VITE_OPENROUTER_API_KEY') ||
    readServerEnvValue('OPENROUTER_KEY')
  );
}

export function getAnthropicKeyFallback(): string | undefined {
  return readServerEnvValue('ANTHROPIC_API_KEY');
}
