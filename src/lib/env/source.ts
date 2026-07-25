import { readEnvValue } from '@/lib/env/values';

export type ServerEnvSource = Record<string, string | undefined>;

let bound: ServerEnvSource | undefined;

/**
 * Cloudflare hands the environment to the worker per request instead of
 * exposing `process.env`. Binding it once per invocation lets the shared server
 * modules keep reading config by name; Node (tests, CLI) falls through to
 * `process.env`.
 */
export function bindServerEnv(env: ServerEnvSource | undefined): void {
  bound = env;
}

export function serverEnvSource(): ServerEnvSource {
  if (bound) return bound;
  return typeof process !== 'undefined' && process.env ? (process.env as ServerEnvSource) : {};
}

export function readServerEnvValue(name: string): string | undefined {
  return readEnvValue(serverEnvSource()[name]);
}

/**
 * Server-side production check. Unlike the client's `isProd()`, which reflects
 * the build mode, this reads `NODE_ENV` from the bound environment and reads an
 * absent value as production: Cloudflare does not set it, and defaulting the
 * other way would disable the access gate in a live deployment.
 */
export function isServerProd(): boolean {
  return (readServerEnvValue('NODE_ENV') ?? 'production').toLowerCase() === 'production';
}
