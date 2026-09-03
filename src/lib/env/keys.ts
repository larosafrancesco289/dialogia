// Module: env/keys
// Responsibility: Provider keys for the Node CLI (the tutor simulation). The
// app itself never reads a key from the environment; users paste theirs into
// the key store.

import { readEnvValue } from '@/lib/env/values';

function readProcessEnv(name: string): string | undefined {
  if (typeof process === 'undefined' || !process.env) return undefined;
  return readEnvValue(process.env[name]);
}

export function getOpenRouterKeyFallback(): string | undefined {
  return (
    readProcessEnv('OPENROUTER_API_KEY') ||
    readProcessEnv('VITE_OPENROUTER_API_KEY') ||
    readProcessEnv('OPENROUTER_KEY')
  );
}
