import type { ZodError, ZodType } from 'zod';

export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: ZodError };

export function parseSchema<T>(schema: ZodType<T>, input: unknown): ParseResult<T> {
  const result = schema.safeParse(input);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  return { ok: false, error: result.error };
}
