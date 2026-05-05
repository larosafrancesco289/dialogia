import { z } from 'zod';

export const VerifyCodeRequestSchema = z.object({
  code: z.string(),
});

export const XaiSessionRequestSchema = z.object({
  voice: z.string().optional(),
  instructions: z.string().optional(),
});
