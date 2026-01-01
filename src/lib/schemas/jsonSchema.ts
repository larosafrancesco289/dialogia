import type { ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export type JsonSchema = Record<string, unknown>;

export function toJsonSchema(schema: ZodTypeAny): JsonSchema {
  return zodToJsonSchema(schema, {
    target: 'openApi3',
    $refStrategy: 'none',
  }) as JsonSchema;
}
