// Module: tutor engine plan
// Responsibility: building, validating and reading learning plans (ids, prerequisites, readiness).

import type { LearningPlan, LearningPlanNode } from '@/lib/types';
import { LIMITS } from '@/modules/tutor/engine/rules';

export type PlanNodeInput = {
  id?: string;
  name: string;
  description?: string;
  objectives: string[];
  /** Ids (or names) of other topics in the same proposal. */
  prerequisites?: string[];
  estimatedMinutes?: number;
  /** Where the topic's estimate starts once the plan is approved; see `STARTING_ESTIMATE_MAX`. */
  startingEstimate?: { value: number; reason?: string };
};

export type PlanInput = {
  goal: string;
  nodes: PlanNodeInput[];
  metadata?: LearningPlan['metadata'];
};

export function slugify(text: string): string {
  const slug = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return slug || 'topic';
}

/** Adds -2, -3, ... until the id is free. */
export function uniqueId(base: string, taken: Set<string>): string {
  let id = base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
  return id;
}

/** Ids compared without case or separators, so `Chain_Rule` finds `chain-rule`. */
function looseId(id: string): string {
  return id.toLowerCase().replace(/[-_\s]+/g, '');
}

export function findPlanNode(
  plan: LearningPlan | undefined,
  ref: string,
): LearningPlanNode | undefined {
  if (!plan) return undefined;
  const exact = plan.nodes.find((node) => node.id === ref);
  if (exact) return exact;
  const loose = looseId(ref.trim());
  return plan.nodes.find((node) => looseId(node.id) === loose);
}

export function unmetPrerequisites(plan: LearningPlan, node: LearningPlanNode): LearningPlanNode[] {
  return node.prerequisites
    .map((id) => plan.nodes.find((n) => n.id === id))
    .filter((n): n is LearningPlanNode => !!n && n.status !== 'completed');
}

/** Topics that could be started now: not started, every prerequisite completed. */
export function readyNodes(plan: LearningPlan): LearningPlanNode[] {
  return plan.nodes.filter(
    (node) => node.status === 'not_started' && unmetPrerequisites(plan, node).length === 0,
  );
}

/** The plan's own next step: the first ready topic in plan order. */
export function nextReadyNode(plan: LearningPlan | undefined): LearningPlanNode | undefined {
  return plan ? readyNodes(plan)[0] : undefined;
}

/** Structural problems: counts, unique ids, prerequisites that exist, no self-reference, no cycles. */
export function planProblems(
  nodes: Array<Pick<LearningPlanNode, 'id' | 'name' | 'objectives' | 'prerequisites'>>,
): string[] {
  const problems: string[] = [];
  const { min, max } = LIMITS.planNodes;
  if (nodes.length < min || nodes.length > max) {
    problems.push(`A plan needs ${min} to ${max} topics; this one has ${nodes.length}.`);
  }
  const ids = new Set<string>();
  for (const node of nodes) {
    if (ids.has(node.id)) problems.push(`Two topics share the id "${node.id}".`);
    ids.add(node.id);
    if (!node.name.trim()) problems.push(`Topic "${node.id}" has no name.`);
    const objectives = node.objectives.filter((o) => o.trim());
    if (objectives.length < LIMITS.objectives.min || objectives.length > LIMITS.objectives.max) {
      problems.push(
        `Topic "${node.id}" needs ${LIMITS.objectives.min} to ${LIMITS.objectives.max} objectives.`,
      );
    }
  }
  for (const node of nodes) {
    for (const pre of node.prerequisites) {
      if (pre === node.id) problems.push(`Topic "${node.id}" lists itself as a prerequisite.`);
      else if (!ids.has(pre)) {
        problems.push(`Topic "${node.id}" needs "${pre}", which is not in the plan.`);
      }
    }
  }
  const cycle = findCycle(nodes);
  if (cycle) problems.push(`Prerequisites form a cycle: ${cycle.join(' -> ')}.`);
  return problems;
}

function findCycle(nodes: Array<Pick<LearningPlanNode, 'id' | 'prerequisites'>>): string[] | null {
  const edges = new Map(nodes.map((n) => [n.id, n.prerequisites.filter((p) => p !== n.id)]));
  const done = new Set<string>();
  const path: string[] = [];
  const onPath = new Set<string>();
  const visit = (id: string): string[] | null => {
    if (onPath.has(id)) return [...path.slice(path.indexOf(id)), id];
    if (done.has(id) || !edges.has(id)) return null;
    onPath.add(id);
    path.push(id);
    for (const pre of edges.get(id) ?? []) {
      const found = visit(pre);
      if (found) return found;
    }
    path.pop();
    onPath.delete(id);
    done.add(id);
    return null;
  };
  for (const node of nodes) {
    const found = visit(node.id);
    if (found) return found;
  }
  return null;
}

export type BuiltPlan =
  | { ok: true; plan: LearningPlan; kept: string[]; added: string[]; removed: string[] }
  | { ok: false; problems: string[] };

/**
 * Turns a proposal into a plan. Against an existing plan, a topic keeps its id
 * when the proposal reuses that id (or, failing that, the same name), so its
 * mastery and completion carry over on approval. Only new topics get fresh
 * slug ids. Statuses shown in the proposal are the ones that would carry over.
 */
export function buildPlan(
  input: PlanInput,
  current: LearningPlan | undefined,
  at: number,
): BuiltPlan {
  const goal = input.goal.trim();
  const problems: string[] = [];
  if (!goal) problems.push('The plan needs a goal.');

  const currentIds = new Set(current?.nodes.map((n) => n.id) ?? []);
  const claimed = new Set<string>();
  const ids: string[] = new Array(input.nodes.length);

  input.nodes.forEach((node, i) => {
    const given = node.id?.trim();
    const reused = given ? findPlanNode(current, given)?.id : undefined;
    if (reused && !claimed.has(reused)) {
      ids[i] = reused;
      claimed.add(reused);
    }
  });
  input.nodes.forEach((node, i) => {
    if (ids[i] || node.id?.trim()) return;
    const byName = current?.nodes.find(
      (n) => !claimed.has(n.id) && n.name.trim().toLowerCase() === node.name.trim().toLowerCase(),
    );
    if (byName) {
      ids[i] = byName.id;
      claimed.add(byName.id);
    }
  });
  input.nodes.forEach((node, i) => {
    if (ids[i]) return;
    const id = uniqueId(
      slugify(node.id?.trim() || node.name),
      new Set([...claimed, ...currentIds]),
    );
    ids[i] = id;
    claimed.add(id);
  });

  const resolveRef = (ref: string): string | undefined => {
    const trimmed = ref.trim();
    if (!trimmed) return undefined;
    const direct = ids.find((id) => id === trimmed);
    if (direct) return direct;
    const byGiven = input.nodes.findIndex((n) => n.id?.trim() === trimmed);
    if (byGiven >= 0) return ids[byGiven];
    const byName = input.nodes.findIndex(
      (n) => n.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (byName >= 0) return ids[byName];
    const loose = looseId(trimmed);
    return ids.find((id) => looseId(id) === loose);
  };

  const nodes: LearningPlanNode[] = input.nodes.map((node, i) => {
    const prerequisites: string[] = [];
    for (const ref of node.prerequisites ?? []) {
      const resolved = resolveRef(ref);
      if (!resolved) {
        problems.push(`Topic "${ids[i]}" needs "${ref}", which is not in the plan.`);
      } else if (!prerequisites.includes(resolved)) {
        prerequisites.push(resolved);
      }
    }
    const carried = current?.nodes.find((n) => n.id === ids[i]);
    const description = node.description?.trim();
    return {
      id: ids[i],
      name: node.name.trim(),
      ...(description ? { description } : {}),
      objectives: node.objectives.map((o) => o.trim()).filter(Boolean),
      prerequisites,
      status: carried?.status ?? 'not_started',
      ...(carried?.startedAt != null ? { startedAt: carried.startedAt } : {}),
      ...(carried?.completedAt != null ? { completedAt: carried.completedAt } : {}),
      ...(carried?.completedHow ? { completedHow: carried.completedHow } : {}),
      ...(typeof node.estimatedMinutes === 'number'
        ? { estimatedMinutes: node.estimatedMinutes }
        : {}),
    };
  });

  const givenIds = input.nodes.map((n) => n.id?.trim()).filter(Boolean) as string[];
  const duplicateGiven = givenIds.filter((id, i) => givenIds.indexOf(id) !== i);
  for (const id of new Set(duplicateGiven)) problems.push(`Two topics share the id "${id}".`);

  problems.push(...planProblems(nodes).filter((p) => !problems.includes(p)));
  if (problems.length) return { ok: false, problems };

  const plan: LearningPlan = {
    goal,
    generatedAt: current?.generatedAt ?? at,
    updatedAt: at,
    version: (current?.version ?? 0) + 1,
    nodes,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
  const newIds = new Set(nodes.map((n) => n.id));
  return {
    ok: true,
    plan,
    kept: nodes.filter((n) => currentIds.has(n.id)).map((n) => n.id),
    added: nodes.filter((n) => !currentIds.has(n.id)).map((n) => n.id),
    removed: [...currentIds].filter((id) => !newIds.has(id)),
  };
}
