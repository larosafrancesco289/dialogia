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
