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
import { getNextNode } from '@/lib/learningPlan/service';
import { getChatCompletion } from '@/lib/agent/pipelineClient';
import { logger } from '@/lib/logger';

/**
 * Initialize an empty learner model for a learning plan
 */
export function initializeLearnerModel(chatId: string, plan: LearningPlan): LearnerModel {
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
    "Analyze the student's response to determine learning evidence.",
    'Be objective and focus on demonstrated understanding vs gaps.',
  ].join('\n');

  const userPrompt = [
    `Topic: ${nodeName} (${nodeId})`,
    `Learning Objectives: ${objectives.join('; ')}`,
    '',
    'Recent dialogue:',
    formatted,
    '',
    "Extract learning evidence from the student's most recent response:",
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

    const typeValue = typeof result.type === 'string' ? result.type : undefined;
    const type =
      typeValue && validTypes.includes(typeValue as Evidence['type'])
        ? (typeValue as Evidence['type'])
        : 'partial_answer';

    const weight = clamp(typeof result.weight === 'number' ? result.weight : 0, -0.5, 0.5);

    return {
      type,
      details: typeof result.details === 'string' ? result.details : 'No details provided',
      weight,
      misconception: typeof result.misconception === 'string' ? result.misconception : undefined,
    };
  } catch (error) {
    // Fallback on error: neutral evidence
    logger.error('Evidence extraction failed:', error);
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
    logger.warn(`Node ${update.nodeId} not found in learner model`);
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
  updatedTopic.confidence = calculateMastery(topic.confidence, update.evidence);

  // Handle misconceptions
  if (update.misconception) {
    const existingIndex = updatedTopic.misconceptions.findIndex(
      (m) => m.description === update.misconception!.description,
    );

    if (existingIndex >= 0) {
      // Increment occurrence count (with proper cloning)
      updatedTopic.misconceptions = updatedTopic.misconceptions.map((m, i) =>
        i === existingIndex ? { ...m, occurrences: m.occurrences + 1 } : m,
      );
    } else {
      // Add new misconception
      updatedTopic.misconceptions = [...updatedTopic.misconceptions, update.misconception];
    }
  }

  mastery[update.nodeId] = updatedTopic;

  const globalMetrics = computeGlobalMetrics(mastery, model.globalMetrics, 1);

  return {
    ...model,
    mastery,
    updatedAt: Date.now(),
    globalMetrics,
  };
}

export type LearnerModelFeedback = {
  nodeId: string;
  direction?: 'up' | 'down';
  magnitude?: number;
  reason?: string;
  estimatedConfidence?: number;
  confidenceFloor?: number;
  misconceptionId?: string;
  misconceptionDescription?: string;
};

export function applyLearnerModelFeedback(
  model: LearnerModel,
  feedback: LearnerModelFeedback,
): {
  model: LearnerModel;
  from?: number;
  to?: number;
  resolved?: string[];
  appliedFloor?: number;
  note?: string;
} {
  const topic = model.mastery[feedback.nodeId];
  if (!topic) {
    return { model, note: 'Topic not found in learner model' };
  }

  const magnitude = clamp(Math.abs(feedback.magnitude ?? 0.15), 0.05, 0.4);
  const weight = feedback.direction === 'down' ? -magnitude : magnitude;
  const evidence: Evidence = {
    timestamp: Date.now(),
    type: 'insight_demonstrated',
    weight,
    details:
      feedback.reason ||
      (weight >= 0
        ? 'Learner reported this topic feels easier than estimated.'
        : 'Learner reported this topic feels harder than estimated.'),
  };

  const updatedWithEvidence = updateLearnerModel(model, {
    nodeId: feedback.nodeId,
    evidence,
  });

  const mastery = { ...updatedWithEvidence.mastery };
  const target = { ...mastery[feedback.nodeId] };
  mastery[feedback.nodeId] = target;
  const resolved: string[] = [];
  let appliedFloor: number | undefined;
  let adjusted = false;

  const desiredFloor = clamp(
    Math.max(
      feedback.confidenceFloor ?? 0,
      feedback.estimatedConfidence != null ? feedback.estimatedConfidence : 0,
    ),
    0,
    1,
  );
  if (desiredFloor > 0 && target.confidence < desiredFloor) {
    target.confidence = desiredFloor;
    appliedFloor = desiredFloor;
    adjusted = true;
  } else if (feedback.estimatedConfidence != null) {
    const selfReported = clamp(feedback.estimatedConfidence, 0, 1);
    if (selfReported > target.confidence) {
      target.confidence = selfReported;
      appliedFloor = selfReported;
      adjusted = true;
    }
  }

  if (feedback.misconceptionId || feedback.misconceptionDescription) {
    const matchIndex = target.misconceptions.findIndex((m) => {
      if (feedback.misconceptionId && m.id === feedback.misconceptionId) return true;
      if (!feedback.misconceptionDescription) return false;
      return m.description.toLowerCase() === feedback.misconceptionDescription.toLowerCase();
    });
    if (matchIndex >= 0 && !target.misconceptions[matchIndex].resolved) {
      target.misconceptions = target.misconceptions.map((m, idx) =>
        idx === matchIndex ? { ...m, resolved: true } : m,
      );
      resolved.push(target.misconceptions[matchIndex].description);
      adjusted = true;
    }
  }

  const nextModel: LearnerModel = adjusted
    ? {
        ...updatedWithEvidence,
        mastery,
        globalMetrics: computeGlobalMetrics(mastery, updatedWithEvidence.globalMetrics, 0),
      }
    : updatedWithEvidence;

  return {
    model: nextModel,
    from: topic.confidence,
    to: nextModel.mastery[feedback.nodeId]?.confidence ?? topic.confidence,
    resolved: resolved.length ? resolved : undefined,
    appliedFloor,
    note: feedback.reason,
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
export function calculateMastery(currentConfidence: number, evidence: Evidence): number {
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
export function generateModelSummary(model: LearnerModel, plan: LearningPlan): string {
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
    const activeMisconceptions = mastery.misconceptions.filter((m) => !m.resolved);
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
 * Get latest learner model from message history
 */
export function getLatestLearnerModel(messages: Message[]): LearnerModel | undefined {
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

function computeGlobalMetrics(
  mastery: Record<string, TopicMastery>,
  prior?: LearnerModel['globalMetrics'],
  interactionDelta = 0,
): NonNullable<LearnerModel['globalMetrics']> {
  const allConfidences = Object.values(mastery).map((t) => t.confidence);
  const avgConfidence = allConfidences.reduce((a, b) => a + b, 0) / (allConfidences.length || 1);

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
    totalInteractions: (prior?.totalInteractions || 0) + interactionDelta,
    accuracyRate,
    averageConfidence: avgConfidence,
  };
}

/**
 * Extract text content from message
 */
function extractTextFromMessage(message: Message): string {
  const content = message.content as unknown;
  if (typeof content === 'string') {
    return content;
  }
  return extractTextFromBlocks(content);
}

/**
 * Extract text from LLM response
 */
function extractTextFromResponse(response: unknown): string {
  if (typeof response === 'string') {
    return response;
  }

  if (isRecord(response)) {
    const content = response.content;
    if (typeof content === 'string') {
      return content;
    }
    const blockText = extractTextFromBlocks(content);
    if (blockText) return blockText;

    const choices = response.choices;
    if (Array.isArray(choices) && choices.length > 0) {
      const first = choices[0];
      if (isRecord(first) && isRecord(first.message)) {
        const messageContent = first.message.content;
        if (typeof messageContent === 'string') return messageContent;
        const nested = extractTextFromBlocks(messageContent);
        if (nested) return nested;
      }
    }
  }

  return JSON.stringify(response);
}

/**
 * Parse JSON from LLM response (handles markdown code blocks)
 */
function parseJSONResponse(text: string): Record<string, unknown> {
  const parseValue = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});

  // Try to extract JSON from markdown code blocks
  const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (jsonMatch) {
    try {
      return parseValue(JSON.parse(jsonMatch[1]));
    } catch {
      // Fall through to direct parse
    }
  }

  // Try direct JSON parse
  try {
    return parseValue(JSON.parse(text));
  } catch {
    // Try to find JSON object in text
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return parseValue(JSON.parse(match[0]));
      } catch {
        // Fall through
      }
    }
  }

  // Return empty object as fallback
  return {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function extractTextFromBlocks(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .map((block) => {
      if (!isRecord(block) || block.type !== 'text') return '';
      return typeof block.text === 'string' ? block.text : '';
    })
    .filter(Boolean)
    .join(' ');
}

/**
 * Clamp value to range
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
