import { readEnvValue } from '@/lib/env/values';

export function getNodeEnv(): string | undefined {
  return readEnvValue(process.env.NODE_ENV)?.toLowerCase();
}

export function isProd(): boolean {
  return getNodeEnv() === 'production';
}

export function isDev(): boolean {
  return !isProd();
}
