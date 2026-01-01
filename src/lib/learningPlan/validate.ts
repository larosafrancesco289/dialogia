import type { LearningPlan } from '@/lib/types';
import { LearningPlanSchema } from '@/lib/schemas/learningPlan';

/**
 * Validate learning plan structure
 */
export function validateLearningPlan(plan: LearningPlan): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  const parsed = LearningPlanSchema.safeParse(plan);
  if (!parsed.success) {
    parsed.error.errors.forEach((err) => {
      const path = err.path.length ? err.path.join('.') : 'root';
      errors.push(`schema:${path}:${err.message}`);
    });
    return { valid: false, errors };
  }
  const normalized = parsed.data;

  // Check required fields
  if (!normalized.goal || normalized.goal.trim().length === 0) {
    errors.push('Plan must have a goal');
  }
  if (!normalized.nodes || !Array.isArray(normalized.nodes)) {
    errors.push('Plan must have nodes array');
  }
  if (!normalized.version || typeof normalized.version !== 'number') {
    errors.push('Plan must have version number');
  }

  // Validate nodes
  if (normalized.nodes) {
    if (normalized.nodes.length === 0) {
      errors.push('Plan must have at least one node');
    }
    if (normalized.nodes.length > 20) {
      errors.push('Plan has too many nodes (max 20)');
    }

    const nodeIds = new Set<string>();
    for (const node of normalized.nodes) {
      // Check required node fields
      if (!node.id || node.id.trim().length === 0) {
        errors.push('All nodes must have an id');
      } else {
        // Check for duplicate IDs
        if (nodeIds.has(node.id)) {
          errors.push(`Duplicate node ID: ${node.id}`);
        }
        nodeIds.add(node.id);
      }

      if (!node.name || node.name.trim().length === 0) {
        errors.push(`Node ${node.id} must have a name`);
      }
      if (!node.objectives || !Array.isArray(node.objectives) || node.objectives.length === 0) {
        errors.push(`Node ${node.id} must have at least one objective`);
      }
      if (!node.prerequisites || !Array.isArray(node.prerequisites)) {
        errors.push(`Node ${node.id} must have prerequisites array (can be empty)`);
      }
      if (!node.status) {
        errors.push(`Node ${node.id} must have a status`);
      }
    }

    // Validate prerequisites reference existing nodes
    for (const node of normalized.nodes) {
      if (node.prerequisites) {
        for (const prereqId of node.prerequisites) {
          if (!nodeIds.has(prereqId)) {
            errors.push(`Node ${node.id} references non-existent prerequisite: ${prereqId}`);
          }
          if (prereqId === node.id) {
            errors.push(`Node ${node.id} cannot be its own prerequisite`);
          }
        }
      }
    }

    // Check for circular dependencies via DFS with recursion stack tracking
    const adjacency = new Map<string, string[]>();
    for (const node of normalized.nodes) {
      adjacency.set(node.id, node.prerequisites ?? []);
    }

    const permanentlyVisited = new Set<string>();
    const temporarilyVisited = new Set<string>();
    const cycleMessages = new Set<string>();
    const path: string[] = [];

    const dfs = (nodeId: string) => {
      if (temporarilyVisited.has(nodeId)) {
        const cycleStart = path.indexOf(nodeId);
        const cyclePath = cycleStart >= 0 ? [...path.slice(cycleStart), nodeId] : [nodeId];
        const message =
          cyclePath.length > 1
            ? `Circular dependency detected: ${cyclePath.join(' -> ')}`
            : `Circular dependency detected involving node: ${nodeId}`;
        if (!cycleMessages.has(message)) {
          errors.push(message);
          cycleMessages.add(message);
        }
        return;
      }

      if (permanentlyVisited.has(nodeId)) {
        return;
      }

      temporarilyVisited.add(nodeId);
      path.push(nodeId);

      const prereqs = adjacency.get(nodeId) ?? [];
      for (const prereqId of prereqs) {
        if (!nodeIds.has(prereqId)) {
          continue;
        }
        dfs(prereqId);
      }

      path.pop();
      temporarilyVisited.delete(nodeId);
      permanentlyVisited.add(nodeId);
    };

    for (const node of normalized.nodes) {
      dfs(node.id);
    }
  }

  return { valid: errors.length === 0, errors };
}
