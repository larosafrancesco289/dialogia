import type { LearningPlan, LearningPlanNode } from '@/lib/types';

/**
 * Detect phase from node name patterns like "Phase 1: Basics" or "Module 2: Advanced"
 */
function detectNodePhase(node: LearningPlanNode): string | null {
  const patterns = [/^(Phase \d+)/i, /^(Module \d+)/i, /^(Chapter \d+)/i, /^(Unit \d+)/i];
  for (const pattern of patterns) {
    const match = node.name.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Clean node name by removing phase/module prefix
 */
function cleanNodeName(name: string): string {
  return name.replace(/^(Phase|Module|Chapter|Unit)\s*\d+[:\s-]*/i, '').trim();
}

/**
 * Build breadcrumb path: ["Plan Goal", "Phase X", "Topic Name"]
 */
export function getBreadcrumbPath(plan: LearningPlan, nodeId: string): string[] {
  const node = plan.nodes.find((n) => n.id === nodeId);
  if (!node) return [plan.goal];

  const path: string[] = [];

  // Truncate goal if too long
  const goal = plan.goal.length > 30 ? plan.goal.slice(0, 27) + '...' : plan.goal;
  path.push(goal);

  // Add phase if detected
  const phase = detectNodePhase(node);
  if (phase) path.push(phase);

  // Add clean topic name
  const cleanName = cleanNodeName(node.name) || node.name;
  path.push(cleanName);

  return path;
}

/**
 * Build milestone data from plan nodes for the status bar visualization
 */
export function getMilestones(
  plan: LearningPlan,
): { id: string; status: LearningPlanNode['status']; name: string }[] {
  return plan.nodes.map((node) => ({
    id: node.id,
    status: node.status,
    name: node.name,
  }));
}
