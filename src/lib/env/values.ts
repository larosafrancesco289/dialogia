const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

export function readEnvValue(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export function readBooleanValue(value: string | undefined, defaultValue: boolean): boolean {
  const normalized = readEnvValue(value);
  if (!normalized) return defaultValue;
  return TRUE_VALUES.has(normalized.toLowerCase());
}
