import type { LearningPlan, ModelTransport } from '@/lib/types';
import { getChatCompletion } from '@/lib/agent/pipelineClient';
import type { ModelMessage } from '@/lib/agent/types';
import { validateLearningPlan } from '@/lib/learningPlan/validate';

/**
 * System prompt for learning plan generation
 */
export const PLAN_GENERATOR_SYSTEM =
  `You are an expert curriculum designer and pedagogical planner. Your task is to create a structured learning plan from a student's learning goal.

**Output Requirements**:
- Return a JSON object matching the LearningPlan schema
- Break the goal into 4-12 major topics (nodes)
- **Crucial**: Organize nodes into logical "Phases" or "Modules" (e.g., "Foundation", "Core Concepts", "Advanced Application").
- Each node should have:
  - Clear, specific name (optionally prefixed with phase, e.g., "Phase 1: Basics")
  - 2-4 measurable learning objectives
  - Appropriate prerequisites (use node IDs)
  - Estimated time in minutes (realistic for mastery)
  - A "phase" field in the node object is NOT part of the schema, so ensure the *sequence* and *prerequisites* create clear clusters.
- Use a logical prerequisite structure (simple → complex) that forms a clear dependency tree.
- Node IDs should be lowercase with underscores (e.g., "limits", "basic_derivatives")

**Example structure**:
- Phase 1: Foundations (Nodes A, B) -> Phase 2: Core (Nodes C, D, E) -> Phase 3: Mastery (Nodes F, G)

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
    throw new Error(
      `Failed to parse plan JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
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
      name:
        typeof node?.name === 'string' && node.name.trim()
          ? node.name.trim()
          : `Topic ${index + 1}`,
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
