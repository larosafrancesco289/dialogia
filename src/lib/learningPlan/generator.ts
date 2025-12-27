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
  let planData: Record<string, unknown>;
  try {
    const parsed = JSON.parse(jsonText);
    planData = isRecord(parsed) ? parsed : {};
  } catch (error) {
    throw new Error(
      `Failed to parse plan JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Create LearningPlan with proper timestamps and version
  const rawNodes = Array.isArray(planData.nodes) ? planData.nodes : [];
  const normalizedNodes = rawNodes.map((node, index) => {
    const record = isRecord(node) ? node : {};
    const status: LearningPlan['nodes'][number]['status'] =
      record.status === 'completed' || record.status === 'in_progress'
        ? record.status
        : 'not_started';
    const prerequisites = Array.isArray(record.prerequisites)
      ? record.prerequisites.filter((id: unknown): id is string => typeof id === 'string')
      : [];
    const objectives = Array.isArray(record.objectives)
      ? record.objectives.filter((obj: unknown): obj is string => typeof obj === 'string')
      : [];
    const resources = Array.isArray(record.resources)
      ? record.resources.reduce<NonNullable<LearningPlan['nodes'][number]['resources']>>(
          (acc, entry) => {
            if (!isRecord(entry)) return acc;
            const type = entry.type;
            if (type !== 'reading' && type !== 'video' && type !== 'practice') return acc;
            const title = typeof entry.title === 'string' ? entry.title.trim() : '';
            if (!title) return acc;
            const url = typeof entry.url === 'string' ? entry.url.trim() : undefined;
            acc.push(url ? { type, title, url } : { type, title });
            return acc;
          },
          [],
        )
      : undefined;
    const children = Array.isArray(record.children)
      ? record.children.filter((child): child is string => typeof child === 'string')
      : undefined;
    return {
      id:
        typeof record.id === 'string' && record.id.trim() ? record.id.trim() : `node_${index + 1}`,
      name:
        typeof record.name === 'string' && record.name.trim()
          ? record.name.trim()
          : `Topic ${index + 1}`,
      description: typeof record.description === 'string' ? record.description.trim() : undefined,
      estimatedMinutes:
        typeof record.estimatedMinutes === 'number'
          ? Math.max(5, Math.min(360, Math.round(record.estimatedMinutes)))
          : undefined,
      startedAt: typeof record.startedAt === 'number' ? record.startedAt : undefined,
      completedAt: typeof record.completedAt === 'number' ? record.completedAt : undefined,
      status,
      prerequisites,
      objectives,
      resources,
      children,
    };
  });

  const goalValue =
    typeof planData.goal === 'string' && planData.goal.trim() ? planData.goal.trim() : goal;
  const metadata = (() => {
    const raw = planData.metadata;
    if (!isRecord(raw)) return undefined;
    const estimatedHours = typeof raw.estimatedHours === 'number' ? raw.estimatedHours : undefined;
    const difficulty: NonNullable<LearningPlan['metadata']>['difficulty'] =
      raw.difficulty === 'beginner' ||
      raw.difficulty === 'intermediate' ||
      raw.difficulty === 'advanced'
        ? raw.difficulty
        : undefined;
    const prerequisites = Array.isArray(raw.prerequisites)
      ? raw.prerequisites.filter((entry): entry is string => typeof entry === 'string')
      : undefined;
    if (!estimatedHours && !difficulty && (!prerequisites || prerequisites.length === 0)) {
      return undefined;
    }
    return {
      ...(estimatedHours ? { estimatedHours } : {}),
      ...(difficulty ? { difficulty } : {}),
      ...(prerequisites && prerequisites.length > 0 ? { prerequisites } : {}),
    };
  })();

  const plan: LearningPlan = {
    goal: goalValue,
    generatedAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
    nodes: normalizedNodes,
    metadata,
  };

  // Validate plan structure
  const { valid, errors } = validateLearningPlan(plan);
  if (!valid) {
    throw new Error(`Invalid learning plan: ${errors.join(', ')}`);
  }

  return plan;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
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
