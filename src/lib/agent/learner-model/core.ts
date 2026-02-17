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
} from '@/lib/types';
import { logger } from '@/lib/logger';

/**
 * Normalize a node ID for fuzzy matching: lowercase, strip hyphens/underscores/spaces.
 */
function normalizeNodeId(id: string): string {
  return id.toLowerCase().replace(/[-_\s]+/g, '');
}

function normalizeNodeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokenize(text: string): string[] {
  return normalizeNodeText(text)
    .split(' ')
    .map((t) => t.trim())
    // Keep multi-char tokens plus single-digit numeric tokens (e.g., "topic 2").
    .filter((t) => t.length > 1 || /^\d$/.test(t));
}

function tokenOverlapScore(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const aSet = new Set(a);
  const bSet = new Set(b);
  let inter = 0;
  for (const t of aSet) {
    if (bSet.has(t)) inter++;
  }
  return inter / Math.max(aSet.size, bSet.size);
}

/**
 * Resolve a node ID against the mastery record, falling back to fuzzy matching
 * when the exact key is missing. This handles LLM-generated IDs that use
 * different separator styles (hyphens vs underscores vs camelCase).
 */
export function resolveNodeId(
  mastery: Record<string, TopicMastery>,
  rawId: string,
): string | undefined {
  if (mastery[rawId]) return rawId;
  const normalized = normalizeNodeId(rawId);
  for (const key of Object.keys(mastery)) {
    if (normalizeNodeId(key) === normalized) return key;
  }
  return undefined;
}

/**
 * Resolve a tool-provided node reference against a learning plan.
 * Supports exact/fuzzy ID matching and name/token overlap fallback.
 */
export function resolvePlanNodeId(plan: LearningPlan, rawId: string): string | undefined {
  const input = rawId.trim();
  if (!input) return undefined;

  const exact = plan.nodes.find((n) => n.id === input);
  if (exact) return exact.id;

  const normalizedInputId = normalizeNodeId(input);
  const byId = plan.nodes.find((n) => normalizeNodeId(n.id) === normalizedInputId);
  if (byId) return byId.id;

  const normalizedInputText = normalizeNodeText(input);
  const byNameExact = plan.nodes.find((n) => normalizeNodeText(n.name) === normalizedInputText);
  if (byNameExact) return byNameExact.id;

  const inputTokens = tokenize(input);
  let best: { id: string; score: number } | undefined;
  for (const node of plan.nodes) {
    const idScore = tokenOverlapScore(inputTokens, tokenize(node.id));
    const nameScore = tokenOverlapScore(inputTokens, tokenize(node.name));
    const score = Math.max(idScore, nameScore);
    if (!best || score > best.score) {
      best = { id: node.id, score };
    }
  }

  if (best && best.score >= 0.5) return best.id;
  return undefined;
}

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
 * Sync learner model with an updated plan.
 * - Preserves existing mastery entries for nodes that still exist
 * - Adds new entries for new nodes (with initial confidence)
 * - Removes entries for nodes that were removed from the plan
 */
export function syncLearnerModelWithPlan(
  existingModel: LearnerModel,
  updatedPlan: LearningPlan,
): LearnerModel {
  const planNodeIds = new Set(updatedPlan.nodes.map((n) => n.id));
  const mastery: Record<string, TopicMastery> = {};

  // Keep existing mastery for nodes that still exist in the plan
  for (const nodeId of Object.keys(existingModel.mastery)) {
    if (planNodeIds.has(nodeId)) {
      mastery[nodeId] = existingModel.mastery[nodeId];
    }
  }

  // Add new entries for nodes that don't have mastery records yet
  for (const node of updatedPlan.nodes) {
    if (!mastery[node.id]) {
      mastery[node.id] = {
        nodeId: node.id,
        confidence: 0.3, // Starting prior
        interactions: 0,
        lastInteraction: Date.now(),
        evidence: [],
        misconceptions: [],
        needsReview: false,
      };
    }
  }

  // Recompute global metrics based on current mastery
  const allConfidences = Object.values(mastery).map((t) => t.confidence);
  const avgConfidence = allConfidences.reduce((a, b) => a + b, 0) / (allConfidences.length || 1);
  const totalInteractions = Object.values(mastery).reduce((sum, t) => sum + t.interactions, 0);

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
    ...existingModel,
    mastery,
    updatedAt: Date.now(),
    version: existingModel.version + 1,
    globalMetrics: {
      totalInteractions,
      accuracyRate,
      averageConfidence: avgConfidence,
    },
  };
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
  const resolvedId = resolveNodeId(mastery, update.nodeId);
  const topic = resolvedId ? mastery[resolvedId] : undefined;

  if (!topic || !resolvedId) {
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

  mastery[resolvedId] = updatedTopic;

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
  const resolvedFeedbackId = resolveNodeId(model.mastery, feedback.nodeId);
  const topic = resolvedFeedbackId ? model.mastery[resolvedFeedbackId] : undefined;
  if (!topic || !resolvedFeedbackId) {
    return { model, note: 'Topic not found in learner model' };
  }

  const hasDirectionalAdjustment = feedback.direction === 'up' || feedback.direction === 'down';
  const inferredEstimatedConfidence =
    feedback.estimatedConfidence != null
      ? clamp(feedback.estimatedConfidence, 0, 1)
      : !hasDirectionalAdjustment && feedback.magnitude != null
        ? clamp(feedback.magnitude, 0, 1)
        : undefined;

  let updatedModel = model;
  if (hasDirectionalAdjustment) {
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

    updatedModel = updateLearnerModel(model, {
      nodeId: resolvedFeedbackId,
      evidence,
    });
  }

  const mastery = { ...updatedModel.mastery };
  const target = { ...mastery[resolvedFeedbackId] };
  mastery[resolvedFeedbackId] = target;
  const resolved: string[] = [];
  let appliedFloor: number | undefined;
  let adjusted = false;

  const desiredFloor =
    feedback.confidenceFloor != null ? clamp(feedback.confidenceFloor, 0, 1) : undefined;

  if (desiredFloor != null && target.confidence < desiredFloor) {
    target.confidence = desiredFloor;
    appliedFloor = desiredFloor;
    adjusted = true;
  }

  if (inferredEstimatedConfidence != null) {
    const targetConfidence =
      desiredFloor != null
        ? Math.max(inferredEstimatedConfidence, desiredFloor)
        : inferredEstimatedConfidence;
    if (target.confidence !== targetConfidence) {
      target.confidence = targetConfidence;
      adjusted = true;
    }
    if (desiredFloor != null && targetConfidence === desiredFloor) {
      appliedFloor = desiredFloor;
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
        ...updatedModel,
        mastery,
        globalMetrics: computeGlobalMetrics(mastery, updatedModel.globalMetrics, 0),
      }
    : updatedModel;

  return {
    model: nextModel,
    from: topic.confidence,
    to: nextModel.mastery[resolvedFeedbackId]?.confidence ?? topic.confidence,
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
 * Clamp value to range
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
