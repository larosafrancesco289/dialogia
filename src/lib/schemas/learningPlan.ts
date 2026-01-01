import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import type { LearningPlan } from '@/lib/types';

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

export const LearningPlanNodeInputSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  objectives: z.array(z.string()).min(1).max(6),
  prerequisites: z.array(z.string()).optional(),
  status: z.enum(['not_started', 'in_progress', 'completed']).optional(),
  estimatedMinutes: z.number().optional(),
  resources: z.array(LearningPlanResourceSchema).optional(),
  children: z.array(z.string()).optional(),
});

export const LearningPlanInputSchema = z.object({
  goal: z.string(),
  metadata: LearningPlanMetadataSchema.optional(),
  nodes: z.array(LearningPlanNodeInputSchema).min(1).max(20),
});

export type LearningPlanInput = z.infer<typeof LearningPlanInputSchema>;

const trimValue = (value?: string) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const trimList = (values?: string[]) =>
  Array.isArray(values)
    ? values
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry) => entry.length > 0)
    : [];

export function normalizeLearningPlanInput(
  input: LearningPlanInput,
  opts: { fallbackGoal: string; now?: number },
): LearningPlan {
  const now = opts.now ?? Date.now();
  const nodes: LearningPlan['nodes'] = input.nodes
    .map((node, index) => {
      const name = trimValue(node.name);
      const objectives = trimList(node.objectives);
      if (!name || objectives.length === 0) return null;
      const id = trimValue(node.id) ?? `node_${index + 1}_${uuidv4()}`;
      const prerequisites = trimList(node.prerequisites);
      const resources = Array.isArray(node.resources)
        ? node.resources
            .map((resource) => {
              const title = trimValue(resource.title);
              if (!title) return null;
              const url = trimValue(resource.url);
              return url ? { type: resource.type, title, url } : { type: resource.type, title };
            })
            .filter(Boolean)
        : undefined;
      const children = trimList(node.children);
      const estimatedMinutes =
        typeof node.estimatedMinutes === 'number'
          ? Math.max(5, Math.min(360, Math.round(node.estimatedMinutes)))
          : undefined;
      return {
        id,
        name,
        description: trimValue(node.description),
        objectives,
        prerequisites,
        status:
          node.status === 'in_progress' || node.status === 'completed'
            ? node.status
            : 'not_started',
        estimatedMinutes,
        resources: resources && resources.length > 0 ? resources : undefined,
        children: children.length > 0 ? children : undefined,
      };
    })
    .filter(Boolean) as LearningPlan['nodes'];

  const metadata = input.metadata
    ? {
        estimatedHours: input.metadata.estimatedHours,
        difficulty: input.metadata.difficulty,
        prerequisites: trimList(input.metadata.prerequisites),
      }
    : undefined;

  const goal = trimValue(input.goal) ?? opts.fallbackGoal;

  return {
    goal,
    generatedAt: now,
    updatedAt: now,
    version: 1,
    nodes,
    metadata,
  };
}
