import { z } from 'zod';

export const LearningPlanResourceSchema = z.object({
  type: z.enum(['reading', 'video', 'practice']),
  title: z.string(),
  url: z.string().optional(),
});

export const LearningPlanNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  objectives: z.array(z.string()).min(1).max(6),
  prerequisites: z.array(z.string()),
  status: z.enum(['not_started', 'in_progress', 'completed']),
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
  estimatedMinutes: z.number().optional(),
  resources: z.array(LearningPlanResourceSchema).optional(),
  children: z.array(z.string()).optional(),
});

export const LearningPlanMetadataSchema = z.object({
  estimatedHours: z.number().optional(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  prerequisites: z.array(z.string()).optional(),
});

export const LearningPlanSchema = z.object({
  goal: z.string(),
  generatedAt: z.number(),
  updatedAt: z.number(),
  version: z.number(),
  nodes: z.array(LearningPlanNodeSchema).min(1).max(20),
  metadata: LearningPlanMetadataSchema.optional(),
});
