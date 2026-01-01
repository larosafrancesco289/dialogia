import { z } from 'zod';
import { ProviderSort } from '@/lib/models/providerSort';

export const DeepResearchRequestSchema = z.object({
  task: z.string(),
  model: z.string(),
  audience: z.string().optional(),
  style: z.enum(['concise', 'detailed', 'executive']).optional(),
  cite: z.enum(['inline', 'footnotes']).optional(),
  maxIterations: z.number().optional(),
  providerSort: z.nativeEnum(ProviderSort).optional(),
});

export const VerifyCodeRequestSchema = z.object({
  code: z.string(),
});
