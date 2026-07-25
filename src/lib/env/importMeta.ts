export type EnvRecord = Record<string, string | undefined>;

/**
 * Vite replaces `import.meta.env` with a literal object at build time. Node
 * (tests, CLI scripts) has no such object, so the same `VITE_*` names are read
 * from `process.env` there. Both sources are read lazily because tests swap
 * `process.env` wholesale.
 */
function viteEnv(): EnvRecord {
  try {
    return (import.meta as unknown as { env?: EnvRecord }).env ?? {};
  } catch {
    return {};
  }
}

function nodeEnv(): EnvRecord {
  return typeof process !== 'undefined' && process.env ? (process.env as EnvRecord) : {};
}

export function readClientEnv(name: string): string | undefined {
  return viteEnv()[name] ?? nodeEnv()[name];
}

/** Build mode: Vite's `MODE` in the browser, `NODE_ENV` under Node. */
export function readClientMode(): string | undefined {
  return viteEnv().MODE ?? nodeEnv().NODE_ENV;
}
