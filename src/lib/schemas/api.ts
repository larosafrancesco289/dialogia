import { z } from 'zod';

export const VerifyCodeRequestSchema = z.object({
  code: z.string(),
});
