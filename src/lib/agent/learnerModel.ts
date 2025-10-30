/**
 * Learner Model Management
 *
 * Tracks student mastery per topic with evidence-based confidence estimation.
 * Uses Bayesian-style updates to adjust confidence based on observed performance.
 */

import type {
  LearningPlan,
  LearnerModel,
  TopicMastery,
  Evidence,
  Misconception,
  Message,
  ModelTransport,
} from '@/lib/types';
import { getNextNode } from '@/lib/agent/planGenerator';
import { getChatCompletion } from '@/lib/agent/pipelineClient';

/**
 * Initialize an empty learner model for a learning plan
 */
export function initializeLearnerModel(
  chatId: string,
  plan: LearningPlan,
): LearnerModel {
  const mastery: Record<string, TopicMastery> = {};

  // Create initial mastery entry for each node
  for (const node of plan.nodes) {
    mastery[node.id] = {
      nodeId: node.id,
      confidence: 0.3, // Starting prior (low confidence)
      interactions: 0,
      lastInteraction: Date.now(),
      evidence: [],
      misconceptions: [],
      needsReview: false,
    };
  }

  return {
    chatId,
    updatedAt: Date.now(),
    version: 1,
    mastery,
    globalMetrics: {
      totalInteractions: 0,
      accuracyRate: 0,
      averageConfidence: 0.3,
    },
  };
}

/**
 * Extract evidence from student response using LLM analysis.
 * Mirrors the legacy tutor memory extraction flow to keep prompts consistent.
 */
export async function extractEvidence(
  nodeId: string,
  nodeName: string,
  objectives: string[],
  conversationWindow: Message[],
  options: {
    apiKey: string;
    transport: ModelTransport;
    model: string;
  },
): Promise<{
  type: Evidence['type'];
  details: string;
  weight: number;
  misconception?: string;
}> {
  // Format last few messages as context
  const formatted = conversationWindow
    .slice(-5)
    .map((m) => {
      const role = m.role === 'assistant' ? 'Tutor' : 'Student';
      const content = extractTextFromMessage(m);
      return `${role}: ${content}`;
    })
    .join('\n\n');

  const systemPrompt = [
    'You are a learning analyst evaluating student understanding.',
    'Analyze the student\'s response to determine learning evidence.',
    'Be objective and focus on demonstrated understanding vs gaps.',
  ].join('\n');

  const userPrompt = [
    `Topic: ${nodeName} (${nodeId})`,
    `Learning Objectives: ${objectives.join('; ')}`,
    '',
    'Recent dialogue:',
    formatted,
    '',
    'Extract learning evidence from the student\'s most recent response:',
    '',
    '1. Evidence type (choose one):',
    '   - correct_answer: Student answered correctly with good understanding',
    '   - incorrect_answer: Student gave wrong answer or showed misunderstanding',
    '   - partial_answer: Student has partial understanding, some gaps',
    '   - hint_needed: Student needed hints or struggled to respond',
    '   - explanation_requested: Student asked for clarification/more explanation',
    '',
    '2. Details: One clear sentence describing what happened',
    '',
    '3. Weight: Numeric value from -0.5 to +0.5 indicating impact on mastery',
    '   - Positive (+0.1 to +0.5) for correct/strong responses',
    '   - Negative (-0.1 to -0.5) for incorrect/weak responses',
    '   - Near zero for neutral interactions',
    '',
    '4. Misconception (optional): If student showed a specific error pattern, describe it briefly',
    '',
    'Respond with ONLY valid JSON in this format:',
    '{"type": "correct_answer", "details": "...", "weight": 0.3, "misconception": "..."}',
  ].join('\n');

  try {
    const response = await getChatCompletion()({
      apiKey: options.apiKey,
      transport: options.transport,
      model: options.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 256,
      temperature: 0.2, // Low temperature for consistent extraction
    });

    const text = extractTextFromResponse(response);
    const result = parseJSONResponse(text);

    // Validate and normalize
    const validTypes: Evidence['type'][] = [
      'correct_answer',
      'incorrect_answer',
      'partial_answer',
      'hint_needed',
      'explanation_requested',
    ];

    const type = validTypes.includes(result.type)
      ? result.type
      : 'partial_answer';

    const weight = clamp(
      typeof result.weight === 'number' ? result.weight : 0,
      -0.5,
      0.5,
    );

    return {
      type,
      details: result.details || 'No details provided',
      weight,
      misconception: result.misconception || undefined,
    };
  } catch (error) {
    // Fallback on error: neutral evidence
    console.error('Evidence extraction failed:', error);
    return {
      type: 'partial_answer',
      details: 'Evidence extraction failed',
      weight: 0,
    };
  }
}

/**
 * Update learner model with new evidence
 * Uses Bayesian-style confidence updates
 */
export function updateLearnerModel(
  model: LearnerModel,
  update: {
    nodeId: string;
    evidence: Evidence;
    misconception?: Misconception;
  },
): LearnerModel {
  // Clone mastery records
  const mastery = { ...model.mastery };
  const topic = mastery[update.nodeId];

  if (!topic) {
    console.warn(`Node ${update.nodeId} not found in learner model`);
    return model;
  }

  // Clone and update topic mastery
  const updatedTopic: TopicMastery = {
    ...topic,
    evidence: [...topic.evidence, update.evidence],
    misconceptions: [...topic.misconceptions], // Clone misconceptions array
    interactions: topic.interactions + 1,
    lastInteraction: Date.now(),
  };

  // Calculate new confidence using Bayesian-style update
  updatedTopic.confidence = calculateMastery(
    topic.confidence,
    update.evidence,
  );

  // Handle misconceptions
  if (update.misconception) {
    const existingIndex = updatedTopic.misconceptions.findIndex(
      (m) => m.description === update.misconception!.description,
    );

    if (existingIndex >= 0) {
      // Increment occurrence count (with proper cloning)
      updatedTopic.misconceptions = updatedTopic.misconceptions.map((m, i) =>
        i === existingIndex
          ? { ...m, occurrences: m.occurrences + 1 }
          : m
      );
    } else {
      // Add new misconception
      updatedTopic.misconceptions = [
        ...updatedTopic.misconceptions,
        update.misconception,
      ];
    }
  }

  mastery[update.nodeId] = updatedTopic;

  // Recalculate global metrics
  const allConfidences = Object.values(mastery).map((t) => t.confidence);
  const avgConfidence =
    allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length;

  const correctCount = Object.values(mastery)
    .flatMap((t) => t.evidence)
    .filter((e) => e.type === 'correct_answer').length;

  const totalEvidence = Object.values(mastery)
    .flatMap((t) => t.evidence)
    .filter((e) =>
      ['correct_answer', 'incorrect_answer', 'partial_answer'].includes(e.type),
    ).length;

  const accuracyRate = totalEvidence > 0 ? correctCount / totalEvidence : 0;

  return {
    ...model,
    mastery,
    updatedAt: Date.now(),
    globalMetrics: {
      totalInteractions: (model.globalMetrics?.totalInteractions || 0) + 1,
      accuracyRate,
      averageConfidence: avgConfidence,
    },
  };
}

/**
 * Calculate mastery confidence using Bayesian-style update
 * Formula: new_confidence = old_confidence + (weight * (1 - old_confidence))
 *
 * This allows:
 * - Positive evidence to increase confidence (diminishing returns as confidence grows)
 * - Negative evidence to decrease confidence
 * - Confidence bounded to [0, 1]
 */
export function calculateMastery(
  currentConfidence: number,
  evidence: Evidence,
): number {
  const weight = evidence.weight;

  // Bayesian update with diminishing returns
  let newConfidence: number;

  if (weight >= 0) {
    // Positive evidence: increase confidence, but with diminishing returns
    newConfidence = currentConfidence + weight * (1 - currentConfidence);
  } else {
    // Negative evidence: decrease confidence
    newConfidence = currentConfidence + weight * currentConfidence;
  }

  // Clamp to [0, 1]
  return clamp(newConfidence, 0, 1);
}

/**
 * Generate learner model summary for tutor context
 * Formats mastery data in a concise, readable format
 */
export function generateModelSummary(
  model: LearnerModel,
  plan: LearningPlan,
): string {
  const lines: string[] = ['STUDENT MASTERY'];

  // Find current node
  const currentNode = getNextNode(plan);

  for (const node of plan.nodes) {
    const mastery = model.mastery[node.id];
    if (!mastery) continue;

    const confidence = Math.round(mastery.confidence * 100);

    // Status indicator
    let status = '○';
    if (node.id === currentNode?.id) {
      status = '⚡';
    } else if (node.status === 'completed') {
      status = '✓';
    } else if (node.status === 'in_progress') {
      status = '→';
    }

    lines.push(
      `${status} ${node.name}: ${confidence}% confident (${mastery.interactions} interactions)`,
    );

    // Include active misconceptions
    const activeMisconceptions = mastery.misconceptions.filter(
      (m) => !m.resolved,
    );
    if (activeMisconceptions.length > 0) {
      for (const m of activeMisconceptions) {
        lines.push(`  ⚠️  ${m.description} (seen ${m.occurrences}x)`);
      }
    }
  }

  // Add overall metrics
  if (model.globalMetrics) {
    lines.push('');
    lines.push(
      `Overall: ${Math.round(model.globalMetrics.accuracyRate * 100)}% accuracy, ` +
        `${Math.round(model.globalMetrics.averageConfidence * 100)}% avg confidence`,
    );
  }

  return lines.join('\n');
}

/**
 * Wrapper for updating learner model with frequency checking
 * Follows maybeAdvanceTutorMemory pattern from tutorFlow.ts
 */
export async function maybeUpdateLearnerModel(args: {
  apiKey: string;
  transport: ModelTransport;
  modelId: string;
  plan?: LearningPlan;
  learnerModel?: LearnerModel;
  conversation: Message[];
  updateFrequency: number;
  autoUpdate: boolean;
}): Promise<{
  updatedModel: LearnerModel;
  debug?: {
    nodeId: string;
    nodeName: string;
    evidenceType: Evidence['type'];
    weight: number;
    oldConfidence: number;
    newConfidence: number;
    interactionCount: number;
  };
}> {
  const { plan, learnerModel, conversation, updateFrequency, autoUpdate } =
    args;

  // If no plan or model, return unchanged
  if (!plan || !learnerModel) {
    return { updatedModel: learnerModel! };
  }

  // Respect configured update cadence before making API calls
  const priorCount =
    (learnerModel as any)._interactionCount ??
    learnerModel.globalMetrics?.totalInteractions ??
    0;
  const nextCount = priorCount + 1;

  if (!autoUpdate || nextCount < updateFrequency) {
    // Not time to update yet
    return {
      updatedModel: {
        ...learnerModel,
        _interactionCount: nextCount,
      } as any,
    };
  }

  // Determine current node
  const currentNode = getNextNode(plan);
  if (!currentNode) {
    // No more nodes to work on
    return { updatedModel: learnerModel };
  }

  const currentMastery = learnerModel.mastery[currentNode.id];
  const oldConfidence = currentMastery?.confidence ?? 0.3;

  try {
    // Extract evidence for current node
    const evidenceData = await extractEvidence(
      currentNode.id,
      currentNode.name,
      currentNode.objectives,
      conversation,
      {
        apiKey: args.apiKey,
        transport: args.transport,
        model: args.modelId,
      },
    );

    // Build evidence object
    const evidenceObj: Evidence = {
      timestamp: Date.now(),
      type: evidenceData.type,
      details: evidenceData.details,
      weight: evidenceData.weight,
    };

    // Build misconception if present
    const misconceptionObj = evidenceData.misconception
      ? {
          id: `misc_${Date.now()}`,
          description: evidenceData.misconception,
          firstObserved: Date.now(),
          occurrences: 1,
          resolved: false,
        }
      : undefined;

    // Update model
    const updated = updateLearnerModel(learnerModel, {
      nodeId: currentNode.id,
      evidence: evidenceObj,
      misconception: misconceptionObj,
    });

    const newConfidence = updated.mastery[currentNode.id]?.confidence ?? 0.3;

    // Reset interaction counter
    return {
      updatedModel: {
        ...updated,
        _interactionCount: 0,
      } as any,
      debug: {
        nodeId: currentNode.id,
        nodeName: currentNode.name,
        evidenceType: evidenceData.type,
        weight: evidenceData.weight,
        oldConfidence,
        newConfidence,
        interactionCount: nextCount,
      },
    };
  } catch (error) {
    console.error('Learner model update failed:', error);
    // Return unchanged on error
    return {
      updatedModel: {
        ...learnerModel,
        _interactionCount: 0,
      } as any,
    };
  }
}

/**
 * Get latest learner model from message history
 */
export function getLatestLearnerModel(
  messages: Message[],
): LearnerModel | undefined {
  // Search backwards for most recent assistant message with learnerModel
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant' && messages[i].learnerModel) {
      return messages[i].learnerModel;
    }
  }
  return undefined;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract text content from message
 */
function extractTextFromMessage(message: Message): string {
  if (typeof message.content === 'string') {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    return (message.content as any[])
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text)
      .join(' ');
  }

  return '';
}

/**
 * Extract text from LLM response
 */
function extractTextFromResponse(response: any): string {
  if (typeof response === 'string') {
    return response;
  }

  if (response.content) {
    if (typeof response.content === 'string') {
      return response.content;
    }
    if (Array.isArray(response.content)) {
      return response.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join(' ');
    }
  }

  if (response.choices?.[0]?.message?.content) {
    return response.choices[0].message.content;
  }

  return JSON.stringify(response);
}

/**
 * Parse JSON from LLM response (handles markdown code blocks)
 */
function parseJSONResponse(text: string): any {
  // Try to extract JSON from markdown code blocks
  const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch {
      // Fall through to direct parse
    }
  }

  // Try direct JSON parse
  try {
    return JSON.parse(text);
  } catch {
    // Try to find JSON object in text
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        // Fall through
      }
    }
  }

  // Return empty object as fallback
  return {};
}

/**
 * Clamp value to range
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
