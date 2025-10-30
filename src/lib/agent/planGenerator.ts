import type { LearningPlan, LearningPlanNode, ModelTransport } from '@/lib/types';
import { getChatCompletion } from '@/lib/agent/pipelineClient';
import type { ModelMessage } from '@/lib/agent/types';

/**
 * System prompt for learning plan generation
 */
export const PLAN_GENERATOR_SYSTEM = `You are an expert curriculum designer and pedagogical planner. Your task is to create a structured learning plan from a student's learning goal.

**Output Requirements**:
- Return a JSON object matching the LearningPlan schema
- Break the goal into 4-8 major topics (nodes)
- Each node should have:
  - Clear, specific name
  - 2-4 measurable learning objectives
  - Appropriate prerequisites (use node IDs)
  - Estimated time in minutes (realistic for mastery)
- Use a logical prerequisite structure (simple → complex)
- Consider cognitive load (don't overwhelm)
- Node IDs should be lowercase with underscores (e.g., "limits", "basic_derivatives")

**Example structure**:
- Prerequisites (review/foundation)
- Core concepts (main topics)
- Applications (practice/synthesis)

Be realistic about time estimates. Prefer depth over breadth.

Respond with ONLY the JSON object, no additional text.`.trim();

/**
 * Generate a learning plan from a student's learning goal
 */
export async function generateLearningPlan(
  goal: string,
  options: {
    apiKey: string;
    transport: ModelTransport;
    model: string;
    priorKnowledge?: string[];
    timeConstraint?: number; // Hours available
    difficulty?: 'beginner' | 'intermediate' | 'advanced';
    signal?: AbortSignal;
  },
): Promise<LearningPlan> {
  const { apiKey, transport, model, priorKnowledge, timeConstraint, difficulty, signal } = options;

  // Build user prompt with context
  const contextParts: string[] = [];
  if (priorKnowledge && priorKnowledge.length > 0) {
    contextParts.push(`Prior knowledge: ${priorKnowledge.join(', ')}`);
  }
  if (timeConstraint) {
    contextParts.push(`Time available: ${timeConstraint} hours`);
  }
  if (difficulty) {
    contextParts.push(`Target difficulty: ${difficulty}`);
  }

  const userPrompt = [
    `Learning goal: ${goal}`,
    contextParts.length > 0 ? contextParts.join('\n') : '',
    '',
    'Generate a structured learning plan in JSON format.',
  ]
    .filter(Boolean)
    .join('\n');

  const messages: ModelMessage[] = [
    { role: 'system', content: PLAN_GENERATOR_SYSTEM },
    { role: 'user', content: userPrompt },
  ];

  // Call LLM
  const response = await getChatCompletion()({
    apiKey,
    transport,
    model,
    messages,
    max_tokens: 3000,
    temperature: 0.7,
    signal,
  });

  // Extract response content
  const responseContent = response?.choices?.[0]?.message?.content;
  const text = Array.isArray(responseContent)
    ? responseContent
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('')
        .trim()
    : (responseContent ?? '').toString().trim();

  if (!text) {
    throw new Error('Empty response from plan generator');
  }

  // Extract JSON from response (may be wrapped in markdown code blocks)
  let jsonText = text;
  const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonMatch) {
    jsonText = jsonMatch[1].trim();
  }

  // Parse JSON
  let planData: any;
  try {
    planData = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`Failed to parse plan JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Create LearningPlan with proper timestamps and version
  const rawNodes: any[] = Array.isArray(planData.nodes) ? planData.nodes : [];
  const normalizedNodes = rawNodes.map((node, index) => {
    const status = (() => {
      if (node?.status === 'completed' || node?.status === 'in_progress') return node.status;
      return 'not_started';
    })();
    const prerequisites = Array.isArray(node?.prerequisites)
      ? node.prerequisites.filter((id: unknown): id is string => typeof id === 'string')
      : [];
    const objectives = Array.isArray(node?.objectives)
      ? node.objectives.filter((obj: unknown): obj is string => typeof obj === 'string')
      : [];
    return {
      ...node,
      id: typeof node?.id === 'string' && node.id.trim() ? node.id.trim() : `node_${index + 1}`,
      name: typeof node?.name === 'string' && node.name.trim() ? node.name.trim() : `Topic ${index + 1}`,
      status,
      prerequisites,
      objectives,
    };
  });

  const plan: LearningPlan = {
    goal: planData.goal || goal,
    generatedAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
    nodes: normalizedNodes,
    metadata: planData.metadata,
  };

  // Validate plan structure
  const { valid, errors } = validateLearningPlan(plan);
  if (!valid) {
    throw new Error(`Invalid learning plan: ${errors.join(', ')}`);
  }

  return plan;
}

/**
 * Detect if a user message contains a learning goal
 */
export function detectLearningGoal(message: string): {
  detected: boolean;
  goal?: string;
  confidence: number;
} {
  const normalizedMessage = message.toLowerCase().trim();

  // High-confidence patterns
  const highConfidencePatterns = [
    /(?:i want to|i'd like to|help me|teach me|can you teach me)\s+(?:learn|understand|master)\s+(.+)/i,
    /(?:learn|study|master|understand)\s+(.+?)(?:\.|!|\?|$)/i,
    /(?:how (?:do|can) i)\s+(?:learn|study|master|understand)\s+(.+)/i,
  ];

  for (const pattern of highConfidencePatterns) {
    const match = message.match(pattern);
    if (match) {
      const goal = match[1].trim();
      // Filter out very short or vague goals
      if (goal.length > 3 && !goal.match(/^(it|this|that|something|anything)$/i)) {
        return { detected: true, goal, confidence: 0.9 };
      }
    }
  }

  // Medium-confidence patterns
  const mediumConfidencePatterns = [
    /^(?:let's |please )?(?:learn|study|practice)\s+(.+)/i,
    /^(?:teach|explain|show me)\s+(.+)/i,
  ];

  for (const pattern of mediumConfidencePatterns) {
    const match = message.match(pattern);
    if (match) {
      const goal = match[1].trim();
      if (goal.length > 3) {
        return { detected: true, goal, confidence: 0.6 };
      }
    }
  }

  return { detected: false, confidence: 0 };
}

/**
 * Validate learning plan structure
 */
export function validateLearningPlan(plan: LearningPlan): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check required fields
  if (!plan.goal || plan.goal.trim().length === 0) {
    errors.push('Plan must have a goal');
  }
  if (!plan.nodes || !Array.isArray(plan.nodes)) {
    errors.push('Plan must have nodes array');
  }
  if (!plan.version || typeof plan.version !== 'number') {
    errors.push('Plan must have version number');
  }

  // Validate nodes
  if (plan.nodes) {
    if (plan.nodes.length === 0) {
      errors.push('Plan must have at least one node');
    }
    if (plan.nodes.length > 20) {
      errors.push('Plan has too many nodes (max 20)');
    }

    const nodeIds = new Set<string>();
    for (const node of plan.nodes) {
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
    for (const node of plan.nodes) {
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
    for (const node of plan.nodes) {
      adjacency.set(node.id, node.prerequisites ?? []);
    }

    const permanentlyVisited = new Set<string>();
    const temporarilyVisited = new Set<string>();
    const cycleMessages = new Set<string>();
    const path: string[] = [];

    const dfs = (nodeId: string) => {
      if (temporarilyVisited.has(nodeId)) {
        const cycleStart = path.indexOf(nodeId);
        const cyclePath =
          cycleStart >= 0 ? [...path.slice(cycleStart), nodeId] : [nodeId];
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

    for (const node of plan.nodes) {
      dfs(node.id);
    }
  }

  return { valid: errors.length === 0, errors };
}

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
