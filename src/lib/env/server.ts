import 'server-only';

import { readEnvValue } from '@/lib/env/values';
import { isProd } from '@/lib/env/runtime';

export type MissingEnvError = Error & { code: 'missing_env'; env: string };

export function missingEnvError(name: string): MissingEnvError {
  const error = new Error(`missing_env:${name}`) as MissingEnvError;
  error.code = 'missing_env';
  error.env = name;
  return error;
}

export function requireServerEnv(name: string): string {
  const value = readEnvValue(process.env[name]);
  if (!value) throw missingEnvError(name);
  return value;
}

export function getServerEnv(name: string): string | undefined {
  return readEnvValue(process.env[name]);
}

export function getAccessCodePepper(): string {
  return requireServerEnv('ACCESS_CODE_PEPPER');
}

export function getAuthCookieSecret(): string {
  return requireServerEnv('AUTH_COOKIE_SECRET');
}

export function getIndividualCodeHashes(): string[] {
  const raw = readEnvValue(process.env.ACCESS_CODES_INDIVIDUAL_HASHED) || '';
  return raw
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => segment.toLowerCase());
}

export function getDeveloperCodeHashes(): string[] {
  const raw = readEnvValue(process.env.ACCESS_CODES_DEVELOPER_HASHED) || '';
  return raw
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => segment.toLowerCase());
}

export function hasTieredCodesConfigured(): boolean {
  return getIndividualCodeHashes().length > 0 || getDeveloperCodeHashes().length > 0;
}

export function getAccessCookieDomain(): string | undefined {
  return readEnvValue(process.env.ACCESS_COOKIE_DOMAIN);
}

export function getServerOpenRouterKey(): string | undefined {
  return readEnvValue(process.env.OPENROUTER_API_KEY);
}

export function getServerOpenRouterFreeKey(): string | undefined {
  return readEnvValue(process.env.OPENROUTER_FREE_API_KEY);
}

export function getServerAnthropicKey(): string | undefined {
  return readEnvValue(process.env.ANTHROPIC_API_KEY);
}

export function requireServerOpenRouterKey(): string {
  return requireServerEnv('OPENROUTER_API_KEY');
}

export function requireServerAnthropicKey(): string {
  return requireServerEnv('ANTHROPIC_API_KEY');
}

export function getTavilyApiKey(): string | undefined {
  return readEnvValue(process.env.TAVILY_API_KEY);
}

export function requireTavilyApiKey(): string {
  return requireServerEnv('TAVILY_API_KEY');
}

export function hasTavilyApiKey(): boolean {
  return Boolean(getTavilyApiKey());
}

export function getFalKey(): string | undefined {
  return readEnvValue(process.env.FAL_KEY);
}

export function requireFalKey(): string {
  return requireServerEnv('FAL_KEY');
}

export function getXaiApiKey(): string | undefined {
  return readEnvValue(process.env.XAI_API_KEY);
}

export function requireXaiApiKey(): string {
  return requireServerEnv('XAI_API_KEY');
}

export { getOpenRouterKeyFallback } from '@/lib/env/keys';

export { isProd };
