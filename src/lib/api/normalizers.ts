import type { Usage } from '@/lib/api/openrouterClient';

const toNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

type UsageLike = Partial<{
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
}>;

export function normalizeUsage(fields?: UsageLike): Usage | undefined {
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
    return undefined;
  }

  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: total,
    input_tokens: input,
    output_tokens: output,
  };
}

export function fromAnthropicUsage(usage?: { input_tokens?: number; output_tokens?: number }) {
  if (!usage) return undefined;
  return normalizeUsage({
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
  });
}

export function shouldIncludeUsage(stream: boolean | undefined): boolean {
  return stream === true;
}

export type { Usage };
