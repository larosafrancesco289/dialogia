import { readClientMode } from '@/lib/env/importMeta';
import { readEnvValue } from '@/lib/env/values';

export function getNodeEnv(): string | undefined {
  return readEnvValue(readClientMode())?.toLowerCase();
}

export function isProd(): boolean {
  return getNodeEnv() === 'production';
}

export function isDev(): boolean {
  return !isProd();
}
