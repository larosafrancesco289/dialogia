import type { Usage } from '@/lib/transport/completions';

const toNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value)
    ? value
    : typeof value === 'string' && value.trim() !== ''
      ? Number.isFinite(Number(value))
        ? Number(value)
        : undefined
      : undefined;

type UsageLike = Record<string, unknown> &
  Partial<{
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    input_tokens: number;
    output_tokens: number;
  }>;

const NUMERIC_USAGE_KEYS = [
  'prompt_tokens',
  'completion_tokens',
  'total_tokens',
  'input_tokens',
  'output_tokens',
  'cache_creation_input_tokens',
  'cache_read_input_tokens',
  'cost',
  'cache_discount',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeRecord(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    const numeric = toNumber(raw);
    if (numeric != null) {
      out[key] = numeric;
      continue;
    }
    if (isRecord(raw)) {
      const nested = normalizeRecord(raw);
      if (nested) out[key] = nested;
      continue;
    }
    if (raw != null) out[key] = raw;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function mergeRecord(
  base: Record<string, unknown> | undefined,
  next: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!base) return next;
  if (!next) return base;
  return { ...base, ...next };
}

function sumRecord(
  base: Record<string, unknown> | undefined,
  next: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!base) return next;
  if (!next) return base;
  const result: Record<string, unknown> = { ...base, ...next };
  for (const key of new Set([...Object.keys(base), ...Object.keys(next)])) {
    const left = toNumber(base[key]);
    const right = toNumber(next[key]);
    if (left != null || right != null) {
      result[key] = (left ?? 0) + (right ?? 0);
      continue;
    }
    const nested = sumRecord(
      isRecord(base[key]) ? (base[key] as Record<string, unknown>) : undefined,
      isRecord(next[key]) ? (next[key] as Record<string, unknown>) : undefined,
    );
    if (nested) result[key] = nested;
  }
  return result;
}

export function normalizeUsage(fields?: UsageLike | null): Usage | undefined {
  if (!fields) return undefined;
  const prompt = toNumber(fields.prompt_tokens ?? fields.input_tokens);
  const completion = toNumber(fields.completion_tokens ?? fields.output_tokens);
  const total =
    toNumber(fields.total_tokens) ??
    (typeof prompt === 'number' && typeof completion === 'number'
      ? prompt + completion
      : undefined);
  const input = toNumber(fields.input_tokens) ?? prompt;
  const output = toNumber(fields.output_tokens) ?? completion;

  if (prompt == null && completion == null && total == null && input == null && output == null) {
    const hasRichUsage =
      toNumber(fields.cost) != null ||
      toNumber(fields.cache_discount) != null ||
      toNumber(fields.cache_creation_input_tokens) != null ||
      toNumber(fields.cache_read_input_tokens) != null ||
      normalizeRecord(fields.prompt_tokens_details) != null ||
      normalizeRecord(fields.completion_tokens_details) != null ||
      normalizeRecord(fields.cost_details) != null ||
      normalizeRecord(fields.server_tool_use) != null;
    if (!hasRichUsage) return undefined;
  }

  const usage: Usage = {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: total,
    input_tokens: input,
    output_tokens: output,
  };
  const cacheCreation = toNumber(fields.cache_creation_input_tokens);
  const cacheRead = toNumber(fields.cache_read_input_tokens);
  const cost = toNumber(fields.cost);
  const cacheDiscount = toNumber(fields.cache_discount);
  const promptDetails = normalizeRecord(fields.prompt_tokens_details);
  const completionDetails = normalizeRecord(fields.completion_tokens_details);
  const costDetails = normalizeRecord(fields.cost_details);
  const serverToolUse = normalizeRecord(fields.server_tool_use);

  if (cacheCreation != null) usage.cache_creation_input_tokens = cacheCreation;
  if (cacheRead != null) usage.cache_read_input_tokens = cacheRead;
  if (promptDetails) usage.prompt_tokens_details = promptDetails;
  if (completionDetails) usage.completion_tokens_details = completionDetails;
  if (cost != null) usage.cost = cost;
  if (costDetails) usage.cost_details = costDetails;
  if (cacheDiscount != null) usage.cache_discount = cacheDiscount;
  if (serverToolUse) usage.server_tool_use = serverToolUse;
  if (typeof fields.is_byok === 'boolean') usage.is_byok = fields.is_byok;

  return usage;
}

export function mergeUsage(base: Usage | undefined, next: Usage | undefined): Usage | undefined {
  if (!base) return next;
  if (!next) return base;
  const usage: Usage = { ...base, ...next };
  for (const key of NUMERIC_USAGE_KEYS) {
    usage[key] = toNumber(next[key]) ?? toNumber(base[key]);
  }
  usage.prompt_tokens_details = mergeRecord(base.prompt_tokens_details, next.prompt_tokens_details);
  usage.completion_tokens_details = mergeRecord(
    base.completion_tokens_details,
    next.completion_tokens_details,
  );
  usage.cost_details = mergeRecord(base.cost_details, next.cost_details);
  usage.server_tool_use = mergeRecord(base.server_tool_use, next.server_tool_use);
  return usage;
}

export function sumUsage(base: Usage | undefined, next: Usage | undefined): Usage | undefined {
  if (!base) return next;
  if (!next) return base;
  const usage: Usage = { ...base, ...next };
  const add = (left?: unknown, right?: unknown) => {
    const leftNumber = toNumber(left);
    const rightNumber = toNumber(right);
    return leftNumber != null || rightNumber != null
      ? (leftNumber ?? 0) + (rightNumber ?? 0)
      : undefined;
  };
  for (const key of NUMERIC_USAGE_KEYS) {
    const total = add(base[key], next[key]);
    if (total != null) usage[key] = total;
  }
  usage.prompt_tokens_details = sumRecord(base.prompt_tokens_details, next.prompt_tokens_details);
  usage.completion_tokens_details = sumRecord(
    base.completion_tokens_details,
    next.completion_tokens_details,
  );
  usage.cost_details = sumRecord(base.cost_details, next.cost_details);
  usage.server_tool_use = sumRecord(base.server_tool_use, next.server_tool_use);
  return usage;
}

export function shouldIncludeUsage(stream: boolean | undefined): boolean {
  return stream === true;
}

export type { Usage } from '@/lib/transport/completions';
