import type { LearningPlan, LearningPlanNode } from '@/lib/types';

/**
 * Check if a node is ready to be taught (prerequisites met)
 */
export function isNodeReady(nodeId: string, plan: LearningPlan): boolean {
  const node = plan.nodes.find((n) => n.id === nodeId);
  if (!node) return false;

  // If node has no prerequisites, it's always ready
  if (!node.prerequisites || node.prerequisites.length === 0) return true;

  // Check if all prerequisites are completed
  for (const prereqId of node.prerequisites) {
    const prereqNode = plan.nodes.find((n) => n.id === prereqId);
    if (!prereqNode || prereqNode.status !== 'completed') {
      return false;
    }
  }

  return true;
}

/**
 * Get next recommended node based on plan state and learner model
 */
export function getNextNode(plan: LearningPlan): LearningPlanNode | null {
  // First, try to find an in-progress node
  const inProgressNode = plan.nodes.find((n) => n.status === 'in_progress');
  if (inProgressNode) return inProgressNode;

  // Find all ready nodes that haven't been started
  const readyNodes = plan.nodes.filter(
    (node) => node.status === 'not_started' && isNodeReady(node.id, plan),
  );

  if (readyNodes.length === 0) {
    // Check if all nodes are completed
    const allCompleted = plan.nodes.every((n) => n.status === 'completed');
    if (allCompleted) return null; // Plan complete

    // Otherwise, there might be a dependency issue
    return null;
  }

  // Return the first ready node (could be improved with more sophisticated selection)
  return readyNodes[0];
}

/**
 * Update node status in plan
 */
export function updateNodeStatus(
  plan: LearningPlan,
  nodeId: string,
  status: 'not_started' | 'in_progress' | 'completed',
): LearningPlan {
  const now = Date.now();
  const updatedNodes = plan.nodes.map((node) => {
    if (node.id === nodeId) {
      const updatedNode = { ...node, status };

      // Set timestamps based on status changes
      if (status === 'in_progress' && !node.startedAt) {
        updatedNode.startedAt = now;
      } else if (status === 'completed' && !node.completedAt) {
        updatedNode.completedAt = now;
      }

      return updatedNode;
    }
    return node;
  });

  return {
    ...plan,
    nodes: updatedNodes,
    updatedAt: now,
  };
}

/**
 * Get all prerequisite nodes for a given node (recursive)
 */
export function getAllPrerequisites(nodeId: string, plan: LearningPlan): LearningPlanNode[] {
  const node = plan.nodes.find((n) => n.id === nodeId);
  if (!node || !node.prerequisites || node.prerequisites.length === 0) {
    return [];
  }

  const prerequisites: LearningPlanNode[] = [];
  const visited = new Set<string>();

  const collectPrereqs = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);

    const prereqNode = plan.nodes.find((n) => n.id === id);
    if (prereqNode) {
      prerequisites.push(prereqNode);
      if (prereqNode.prerequisites) {
        prereqNode.prerequisites.forEach(collectPrereqs);
      }
    }
  };

  node.prerequisites.forEach(collectPrereqs);
  return prerequisites;
}

/**
 * Calculate plan completion percentage
 */
export function calculatePlanProgress(plan: LearningPlan): {
  completed: number;
  inProgress: number;
  notStarted: number;
  percentComplete: number;
} {
  const completed = plan.nodes.filter((n) => n.status === 'completed').length;
  const inProgress = plan.nodes.filter((n) => n.status === 'in_progress').length;
  const notStarted = plan.nodes.filter((n) => n.status === 'not_started').length;
  const total = plan.nodes.length;

  return {
    completed,
    inProgress,
    notStarted,
    percentComplete: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

/**
 * Generate a text summary of the learning plan for tutor context
 */
export function summarizeLearningPlan(plan: LearningPlan): string {
  const progress = calculatePlanProgress(plan);
  const currentNode = getNextNode(plan);

  const lines: string[] = [
    `Goal: ${plan.goal}`,
    `Progress: ${progress.completed}/${plan.nodes.length} topics completed (${progress.percentComplete}%)`,
  ];

  if (currentNode) {
    lines.push(`Current Focus: ${currentNode.name}`);
    lines.push(`Objectives: ${currentNode.objectives.join('; ')}`);
  }

  // List completed nodes
  const completedNodes = plan.nodes.filter((n) => n.status === 'completed');
  if (completedNodes.length > 0) {
    lines.push(`Completed: ${completedNodes.map((n) => n.name).join(', ')}`);
  }

  // List upcoming ready nodes
  const upcomingNodes = plan.nodes.filter(
    (n) => n.status === 'not_started' && isNodeReady(n.id, plan),
  );
  if (upcomingNodes.length > 0 && upcomingNodes.length <= 3) {
    lines.push(`Next up: ${upcomingNodes.map((n) => n.name).join(', ')}`);
  }

  return lines.join('\n');
}
