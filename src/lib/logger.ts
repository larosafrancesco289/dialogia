type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50,
};

function resolveLogLevel(): LogLevel {
  const raw = process.env.NEXT_PUBLIC_LOG_LEVEL || process.env.LOG_LEVEL;
  const normalized = raw?.toLowerCase();
  if (
    normalized === 'debug' ||
    normalized === 'info' ||
    normalized === 'warn' ||
    normalized === 'error' ||
    normalized === 'silent'
  ) {
    return normalized;
  }
  return process.env.NODE_ENV === 'production' ? 'warn' : 'debug';
}

const ACTIVE_LEVEL = LEVELS[resolveLogLevel()];

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= ACTIVE_LEVEL;
}

export const logger = {
  debug: (...args: unknown[]) => {
    if (shouldLog('debug')) console.debug(...args);
  },
  info: (...args: unknown[]) => {
    if (shouldLog('info')) console.info(...args);
  },
  warn: (...args: unknown[]) => {
    if (shouldLog('warn')) console.warn(...args);
  },
  error: (...args: unknown[]) => {
    if (shouldLog('error')) console.error(...args);
  },
};
