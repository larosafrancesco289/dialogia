import type { LearnerModel, LearningPlan, LearningPlanNode, Message } from '@/lib/types';

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
    lines.push(`Current Focus: ${currentNode.name} [${currentNode.id}]`);
    lines.push(`Objectives: ${currentNode.objectives.join('; ')}`);
  }

  // List completed nodes
  const completedNodes = plan.nodes.filter((n) => n.status === 'completed');
  if (completedNodes.length > 0) {
    lines.push(`Completed: ${completedNodes.map((n) => `${n.name} [${n.id}]`).join(', ')}`);
  }

  // List upcoming ready nodes
  const upcomingNodes = plan.nodes.filter(
    (n) => n.status === 'not_started' && isNodeReady(n.id, plan),
  );
  if (upcomingNodes.length > 0 && upcomingNodes.length <= 3) {
    lines.push(`Next up: ${upcomingNodes.map((n) => `${n.name} [${n.id}]`).join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Determine if a node should be marked complete based on mastery
 */
export function shouldCompleteNode(
  nodeId: string,
  learnerModel: LearnerModel,
  plan: LearningPlan,
): {
  shouldComplete: boolean;
  reasoning: string;
} {
  const mastery = learnerModel.mastery[nodeId];
  const node = plan.nodes.find((n) => n.id === nodeId);

  if (!mastery) {
    return {
      shouldComplete: false,
      reasoning: 'No mastery data available for this node',
    };
  }

  if (!node) {
    return {
      shouldComplete: false,
      reasoning: 'Node not found in plan',
    };
  }

  // Already completed
  if (node.status === 'completed') {
    return {
      shouldComplete: false,
      reasoning: 'Node already marked as completed',
    };
  }

  // Check confidence threshold (70% = 0.7)
  if (mastery.confidence < 0.7) {
    return {
      shouldComplete: false,
      reasoning: `Confidence too low: ${Math.round(mastery.confidence * 100)}% (need 70%+)`,
    };
  }

  // Check for unresolved misconceptions
  const activeMisconceptions = mastery.misconceptions.filter((m) => !m.resolved);
  if (activeMisconceptions.length > 0) {
    return {
      shouldComplete: false,
      reasoning: `Has ${activeMisconceptions.length} unresolved misconception(s): ${activeMisconceptions.map((m) => m.description).join(', ')}`,
    };
  }

  // Require at least one interaction to ensure some evidence exists
  // (Previously required 3 interactions, but this was arbitrary and blocked
  // conversational teaching where the tutor observes understanding without formal quizzes)
  if (mastery.interactions < 1) {
    return {
      shouldComplete: false,
      reasoning: 'No interactions recorded yet',
    };
  }

  // All checks passed
  return {
    shouldComplete: true,
    reasoning: `Confidence ${Math.round(mastery.confidence * 100)}%, ${mastery.interactions} interactions, no misconceptions`,
  };
}

/**
 * Process plan progress and auto-advance nodes when ready
 * Returns updated plan and changes made
 */
export async function processPlanProgress(
  plan: LearningPlan,
  learnerModel: LearnerModel,
): Promise<{
  updatedPlan: LearningPlan;
  planUpdates?: Message['planUpdates'];
  progressMessage?: string;
}> {
  const currentNode = getNextNode(plan);

  // If no current node, plan is complete
  if (!currentNode) {
    return {
      updatedPlan: plan,
      planUpdates: undefined,
      progressMessage: undefined,
    };
  }

  // Check if current node should be completed
  const { shouldComplete, reasoning } = shouldCompleteNode(currentNode.id, learnerModel, plan);

  // Initialize plan updates
  const planUpdates: Message['planUpdates'] = {
    statusChanges: [],
  };

  let updatedPlan = plan;
  let progressMessage: string | undefined;

  if (shouldComplete && currentNode.status !== 'completed') {
    // Mark current node as completed
    updatedPlan = updateNodeStatus(updatedPlan, currentNode.id, 'completed');

    planUpdates.statusChanges!.push({
      nodeId: currentNode.id,
      from: currentNode.status,
      to: 'completed',
    });

    progressMessage = `Completed topic: ${currentNode.name}. ${reasoning}`;

    // Check for next node
    const nextNode = getNextNode(updatedPlan);
    if (nextNode) {
      // Start next node
      updatedPlan = updateNodeStatus(updatedPlan, nextNode.id, 'in_progress');

      planUpdates.statusChanges!.push({
        nodeId: nextNode.id,
        from: 'not_started',
        to: 'in_progress',
      });

      progressMessage += `\nMoving to next topic: ${nextNode.name}`;
    } else {
      // Plan complete!
      progressMessage += '\n\nLearning plan completed.';
    }
  }

  if (progressMessage) {
    planUpdates.summary = progressMessage;
  }

  // Return results
  return {
    updatedPlan,
    planUpdates:
      planUpdates.statusChanges!.length > 0 || planUpdates.summary ? planUpdates : undefined,
    progressMessage,
  };
}

/**
 * Check if plan is complete (all nodes completed)
 */
export function isPlanComplete(plan: LearningPlan): boolean {
  return plan.nodes.every((node) => node.status === 'completed');
}

/**
 * Get plan completion percentage
 */
export function getPlanCompletionPercentage(plan: LearningPlan): number {
  const completed = plan.nodes.filter((node) => node.status === 'completed').length;
  return Math.round((completed / plan.nodes.length) * 100);
}

/**
 * Get estimated remaining time in minutes
 */
export function getEstimatedRemainingTime(plan: LearningPlan): number {
  return plan.nodes
    .filter((node) => node.status !== 'completed')
    .reduce((total, node) => total + (node.estimatedMinutes || 0), 0);
}

/**
 * Get topics that are ready to be worked on (prerequisites met, not completed)
 */
export function getReadyTopics(plan: LearningPlan): LearningPlanNode[] {
  const ready: LearningPlanNode[] = [];

  for (const node of plan.nodes) {
    if (node.status === 'completed') continue;

    // Check if all prerequisites are completed
    const prereqsMet = node.prerequisites.every((prereqId) => {
      const prereq = plan.nodes.find((n) => n.id === prereqId);
      return prereq && prereq.status === 'completed';
    });

    if (prereqsMet) {
      ready.push(node);
    }
  }

  return ready;
}

/**
 * Generate progress report for student
 */
export function generateProgressReport(plan: LearningPlan, learnerModel: LearnerModel): string {
  const completed = plan.nodes.filter((node) => node.status === 'completed').length;
  const total = plan.nodes.length;
  const percentage = Math.round((completed / total) * 100);

  const lines: string[] = [
    `📊 Progress Report: ${plan.goal}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `Completion: ${completed}/${total} topics (${percentage}%)`,
    '',
  ];

  // Add per-topic summary
  lines.push('Topic Status:');
  for (const node of plan.nodes) {
    const mastery = learnerModel.mastery[node.id];
    const confidence = mastery ? Math.round(mastery.confidence * 100) : 0;

    let status = '○ Not started';
    if (node.status === 'completed') {
      status = '✓ Completed';
    } else if (node.status === 'in_progress') {
      status = '⚡ In progress';
    }

    lines.push(`${status} | ${node.name} (${confidence}% confidence)`);
  }

  // Add global metrics
  if (learnerModel.globalMetrics) {
    lines.push('');
    lines.push('Overall Performance:');
    lines.push(`• Accuracy: ${Math.round(learnerModel.globalMetrics.accuracyRate * 100)}%`);
    lines.push(
      `• Average Confidence: ${Math.round(learnerModel.globalMetrics.averageConfidence * 100)}%`,
    );
    lines.push(`• Total Interactions: ${learnerModel.globalMetrics.totalInteractions}`);
  }

  // Add time estimate
  const remainingTime = getEstimatedRemainingTime(plan);
  if (remainingTime > 0) {
    lines.push('');
    const hours = Math.floor(remainingTime / 60);
    const mins = remainingTime % 60;
    lines.push(`Estimated time remaining: ${hours}h ${mins}m`);
  }

  return lines.join('\n');
}
