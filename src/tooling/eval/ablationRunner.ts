/**
 * Ablation Study Runner for Dialogia Thesis Evaluation
 *
 * Usage:
 *   bun run ablation -- [options]
 *
 * Options:
 *   --conditions <list>   Comma-separated conditions (default: all)
 *   --scenarios <list>    Comma-separated scenario IDs (default: all)
 *   --runs <n>            Runs per condition×scenario (default: 3)
 *   --tutor-model <id>    Tutor model (default: moonshotai/kimi-k2.5)
 *   --out <dir>           Output directory (default: tmp/ablation/)
 *   --dry-run             Show what would be run without executing
 *   --resume              Resume from last checkpoint (requires --out with checkpoint)
 *   --list                List available scenarios and conditions
 *
 * Resume:
 *   The runner saves checkpoints after each successful run. If interrupted (Ctrl+C),
 *   use --resume with the same --out directory to continue from where you left off.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { createHeadlessRunner } from '@/tooling/headless/runner';
import { LLMUserSimulator } from '@/tooling/headless/simulators';
import { renderSnapshotTranscript } from '@/tooling/headless/transcript';
import { createModelIndex, isReasoningSupported } from '@/lib/models';
import { resolveModelTransport } from '@/lib/providers';
import { DEFAULT_BASE_SYSTEM } from '@/lib/agent/prompts/baseSystem';
import { getChatCompletion } from '@/lib/agent/pipelineClient';
import { buildJudgeMessages, JUDGE_WEIGHTS, type JudgeVerdict } from '@/tooling/eval/judgePrompts';
import { getLatestLearnerModel, generateModelSummary } from '@/lib/agent/learner-model';
import { summarizeLearningPlan } from '@/lib/learning-plan/service';
import { getOpenRouterKeyFallback } from '@/lib/env/keys';
import { fetchModels } from '@/lib/openrouter';
import {
  ABLATION_CONDITIONS,
  CONDITION_CONFIGS,
  getConditionSettings,
  COMPARISON_PAIRS,
  calculateInteractionEffect,
  type AblationCondition,
} from '@/tooling/eval/ablationConfig';
import {
  ABLATION_SCENARIOS,
  DEFAULT_ABLATION_TUTOR_MODEL_ID,
  getScenarioById,
  generatePlanFromScenario,
  type AblationScenario,
} from '@/tooling/eval/ablationScenarios';
import {
  administerTest,
  calculateLearningGain,
  calculateCohenD,
  calculateStats,
  welchTTest,
  twoWayAnova,
  type TestResult,
  type AnovaResult,
  type AnovaEffect,
} from '@/tooling/eval/prePostTest';
import type { Chat, ModelDescriptor, ModelTransport, LearnerModel } from '@/lib/types';
import type { HeadlessTurnSnapshot } from '@/tooling/headless/types';
import { parseArgs } from '@/lib/cli/args';
import { loadEnvDefaults } from '@/lib/cli/env.node';
import { buildTransportAuth, type TransportAuth } from '@/lib/auth/transport';
import { createOpenRouterAccess } from '@/lib/openrouter/pipeline';

// ============================================================================
// Types
// ============================================================================

/**
 * Tracks when a student exercises editability (plan or mastery adjustments).
 * Used to measure whether editability features are actually used.
 */
type EditEvent = {
  turn: number;
  type: 'plan_modification' | 'mastery_override';
  toolName: string;
  nodeId?: string;
  details?: string;
};

type AblationRunResult = {
  id: string;
  condition: AblationCondition;
  scenario: string;
  runIndex: number;
  preTest: TestResult;
  postTest: TestResult;
  learningGain: number;
  normalizedGain: number;
  gapLearningGain: number; // Learning gain on gap items only
  gapNormalizedGain: number; // Normalized gain on gap items only
  transcript: string;
  turnsUsed: number;
  toolUsage: Record<string, number>;
  editEvents: EditEvent[];
  finalLearnerModel?: LearnerModel;
  masteryTrajectory: Array<{ turn: number; avgConfidence: number }>;
  judgeVerdict?: JudgeVerdict;
  judgeRaw: string;
  durationMs: number;
  completedAt: number;
};

type MechanismMetrics = {
  planEditsCount: number;
  masteryOverridesCount: number;
  advanceTopicCount: number;
  runsWithAdvanceTopic: number;
  gapEvidenceVerifiedCount: number;
  gapEvidenceTotal: number;
  gapEvidenceJsonParseFailedCount: number;
  runsWithPlanEdits: number;
  runsWithMasteryOverrides: number;
};

type AblationSummary = {
  startedAt: number;
  completedAt: number;
  totalRuns: number;
  completedRuns: number;
  config: {
    conditions: AblationCondition[];
    scenarios: string[];
    runsPerCell: number;
    tutorModel: string;
  };
  results: AblationRunResult[];
  statistics: {
    byCondition: Record<
      AblationCondition,
      {
        learningGain: ReturnType<typeof calculateStats>;
        normalizedGain: ReturnType<typeof calculateStats>;
        gapLearningGain: ReturnType<typeof calculateStats>;
        gapNormalizedGain: ReturnType<typeof calculateStats>;
        turnsUsed: ReturnType<typeof calculateStats>;
        judgeScore: ReturnType<typeof calculateStats>;
        judgeSubscores: Record<string, ReturnType<typeof calculateStats>>;
        mechanismMetrics: MechanismMetrics;
      }
    >;
    comparisons: Array<{
      name: string;
      hypothesis: string;
      cohenD: number;
      interpretation: string;
      condition1Mean: number;
      condition2Mean: number;
      tTest: {
        t: number;
        df: number;
        p: number;
        significant: boolean;
        ciLower: number;
        ciUpper: number;
      };
      adjustedP: number; // Holm-Bonferroni corrected p (overall)
      // Gap-only metrics for comparisons
      gapCohenD: number;
      gapInterpretation: string;
      gapCondition1Mean: number;
      gapCondition2Mean: number;
      gapTTest: {
        t: number;
        df: number;
        p: number;
        significant: boolean;
        ciLower: number;
        ciUpper: number;
      };
      gapAdjustedP: number; // Holm-Bonferroni corrected p (gap)
      // Judge score comparison
      judgeCohenD: number;
      judgeInterpretation: string;
      judgeTTest: {
        t: number;
        df: number;
        p: number;
        significant: boolean;
        ciLower: number;
        ciUpper: number;
      };
      judgeAdjustedP: number; // Holm-Bonferroni corrected p (judge)
    }>;
    interactionEffect: number;
    anova?: AnovaResult;
    anovaJudge?: AnovaResult;
  };
};

type AblationConfig = {
  conditions: AblationCondition[];
  scenarios: string[];
  runsPerCell: number;
  tutorModel: string;
  studentModel: string;
  judgeModel: string;
};

type AblationCheckpoint = {
  version: 1;
  sessionId: string;
  startedAt: number;
  config: AblationConfig;
  completedRunIds: string[];
  results: AblationRunResult[];
  lastSavedAt: number;
};

// Configuration constants
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;
const CHECKPOINT_FILENAME = 'ablation-checkpoint.json';
const DEFAULT_CONCURRENCY = 4;
const MAX_CONCURRENCY = 10;

/** Judge dimension names, derived once from JUDGE_WEIGHTS keys. */
const JUDGE_DIMENSIONS = Object.keys(JUDGE_WEIGHTS) as Array<keyof typeof JUDGE_WEIGHTS>;

/**
 * Extract judge overall scores for a given condition from run results.
 */
function judgeScoresForCondition(
  results: AblationRunResult[],
  condition: AblationCondition,
): number[] {
  return results
    .filter((r) => r.condition === condition && r.judgeVerdict?.overall_score != null)
    .map((r) => r.judgeVerdict!.overall_score);
}

/**
 * Compute the arithmetic mean of an array, returning 0 for empty arrays.
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// ============================================================================
// Concurrency Utilities
// ============================================================================

/**
 * Semaphore for controlling concurrent API calls.
 */
class Semaphore {
  private permits: number;
  private waiting: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise((resolve) => {
      this.waiting.push(resolve);
    });
  }

  release(): void {
    if (this.waiting.length > 0) {
      const next = this.waiting.shift();
      next?.();
    } else {
      this.permits++;
    }
  }
}

/**
 * Simple hash function for strings to create seeds.
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Seeded random number generator for deterministic shuffling.
 */
function seededRng(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates shuffle with seeded RNG for deterministic ordering.
 */
export function shuffleArray<T>(array: T[], seed: number): void {
  const rng = seededRng(seed);
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

/**
 * Represents a single run task for parallel execution.
 */
type RunTask = {
  condition: AblationCondition;
  scenario: AblationScenario;
  runIndex: number;
  runId: string;
};

// ============================================================================
// Checkpoint Management
// ============================================================================

function getCheckpointPath(outputDir: string): string {
  return path.join(outputDir, CHECKPOINT_FILENAME);
}

async function saveCheckpoint(checkpoint: AblationCheckpoint, outputDir: string): Promise<void> {
  await fs.mkdir(outputDir, { recursive: true });
  const checkpointPath = getCheckpointPath(outputDir);
  const tempPath = `${checkpointPath}.tmp`;

  // Write to temp file first, then rename for atomicity
  await fs.writeFile(tempPath, JSON.stringify(checkpoint, null, 2));
  await fs.rename(tempPath, checkpointPath);
}

async function loadCheckpoint(outputDir: string): Promise<AblationCheckpoint | null> {
  const checkpointPath = getCheckpointPath(outputDir);
  try {
    const content = await fs.readFile(checkpointPath, 'utf-8');
    const checkpoint = JSON.parse(content) as AblationCheckpoint;
    if (checkpoint.version !== 1) {
      console.warn(`Checkpoint version mismatch: expected 1, got ${checkpoint.version}`);
      return null;
    }
    return backfillCheckpointGapMetrics(checkpoint);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null; // No checkpoint exists
    }
    throw error;
  }
}

async function deleteCheckpoint(outputDir: string): Promise<void> {
  const checkpointPath = getCheckpointPath(outputDir);
  try {
    await fs.unlink(checkpointPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

function backfillGapMetrics(result: AblationRunResult): AblationRunResult {
  const gapPreScore = result.preTest.gapScore ?? result.preTest.score;
  const gapPostScore = result.postTest.gapScore ?? result.postTest.score;
  const computedGapLearningGain = gapPostScore - gapPreScore;
  const computedGapNormalizedGain = calculateLearningGain(gapPreScore, gapPostScore);

  const gapLearningGain = Number.isFinite(result.gapLearningGain)
    ? result.gapLearningGain
    : computedGapLearningGain;
  const gapNormalizedGain = Number.isFinite(result.gapNormalizedGain)
    ? result.gapNormalizedGain
    : computedGapNormalizedGain;

  return { ...result, gapLearningGain, gapNormalizedGain };
}

function backfillCheckpointGapMetrics(checkpoint: AblationCheckpoint): AblationCheckpoint {
  let updated = false;
  const results = checkpoint.results.map((result) => {
    const patched = backfillGapMetrics(result);
    if (
      patched.gapLearningGain !== result.gapLearningGain ||
      patched.gapNormalizedGain !== result.gapNormalizedGain
    ) {
      updated = true;
    }
    return patched;
  });

  if (!updated) return checkpoint;
  console.warn('Checkpoint missing gap metrics; backfilling from pre/post scores.');
  return { ...checkpoint, results };
}

function arraysEqual(a: string[], b: string[]): boolean {
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.length === sortedB.length && sortedA.every((v, i) => v === sortedB[i]);
}

function validateCheckpointConfig(
  checkpoint: AblationCheckpoint,
  currentConfig: AblationConfig,
): { valid: boolean; reason?: string } {
  const checks: Array<{ field: string; valid: boolean; expected: string; actual: string }> = [
    {
      field: 'Conditions',
      valid: arraysEqual(checkpoint.config.conditions, currentConfig.conditions),
      expected: currentConfig.conditions.join(', '),
      actual: checkpoint.config.conditions.join(', '),
    },
    {
      field: 'Scenarios',
      valid: arraysEqual(checkpoint.config.scenarios, currentConfig.scenarios),
      expected: currentConfig.scenarios.join(', '),
      actual: checkpoint.config.scenarios.join(', '),
    },
    {
      field: 'Runs per cell',
      valid: checkpoint.config.runsPerCell === currentConfig.runsPerCell,
      expected: String(currentConfig.runsPerCell),
      actual: String(checkpoint.config.runsPerCell),
    },
    {
      field: 'Tutor model',
      valid: checkpoint.config.tutorModel === currentConfig.tutorModel,
      expected: currentConfig.tutorModel,
      actual: checkpoint.config.tutorModel,
    },
    {
      field: 'Student model',
      valid: checkpoint.config.studentModel === currentConfig.studentModel,
      expected: currentConfig.studentModel,
      actual: checkpoint.config.studentModel,
    },
    {
      field: 'Judge model',
      valid: checkpoint.config.judgeModel === currentConfig.judgeModel,
      expected: currentConfig.judgeModel,
      actual: checkpoint.config.judgeModel,
    },
  ];

  const failed = checks.find((c) => !c.valid);
  if (failed) {
    return {
      valid: false,
      reason: `${failed.field} mismatch: checkpoint has [${failed.actual}], current has [${failed.expected}]`,
    };
  }

  return { valid: true };
}

function generateRunId(condition: AblationCondition, scenarioId: string, runIndex: number): string {
  return `${condition}_${scenarioId}_run${runIndex}`;
}

/**
 * Generate a condition-independent seed for deterministic forced errors.
 * This ensures the same pre-test realizations across conditions for the same scenario/run.
 */
function generateErrorSeed(scenarioId: string, runIndex: number): string {
  return `${scenarioId}_run${runIndex}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Argument Parsing
// ============================================================================

function usage() {
  console.log(`
Ablation Study Runner for Dialogia Thesis Evaluation

Usage: bun run ablation -- [options]

Options:
  --conditions <list>   Comma-separated conditions (default: all)
                        Available: ${ABLATION_CONDITIONS.join(', ')}
  --scenarios <list>    Comma-separated scenario IDs (default: all)
                        Available: ${ABLATION_SCENARIOS.map((s) => s.id).join(', ')}
  --runs <n>            Runs per condition×scenario (default: 3)
  --concurrency <n>     Max parallel API calls (default: ${DEFAULT_CONCURRENCY}, max: ${MAX_CONCURRENCY})
  --no-shuffle          Disable run order randomization (for debugging)
  --tutor-model <id>    Tutor model (default: ${DEFAULT_ABLATION_TUTOR_MODEL_ID})
  --student-model <id>  Student simulator model (default: google/gemini-2.5-flash-lite)
  --judge-model <id>    Judge model (default: anthropic/claude-haiku-4.5)
  --out <dir>           Output directory (default: tmp/ablation/)
  --dry-run             Show what would be run without executing
  --resume              Resume from last checkpoint in output directory
  --list                List available scenarios and conditions
  -h, --help            Show this help message

Examples:
  bun run ablation -- --runs 3 --out results/ablation
  bun run ablation -- --conditions full_system,baseline --scenarios linear_equations
  bun run ablation -- --concurrency 5 --runs 2

Resume after interruption:
  bun run ablation -- --resume --out results/ablation
`);
}

function listAvailable() {
  console.log('\n=== Available Conditions ===\n');
  for (const condition of ABLATION_CONDITIONS) {
    const config = CONDITION_CONFIGS[condition];
    console.log(`  ${condition}`);
    console.log(`    ${config.description}`);
    console.log(
      `    Plan: ${config.planVisible ? (config.planEditable ? 'editable' : 'read-only') : 'hidden'}`,
    );
    console.log(
      `    Model: ${config.learnerModelVisible ? (config.learnerModelEditable ? 'editable' : 'visible') : 'hidden'}`,
    );
    console.log('');
  }

  console.log('\n=== Available Scenarios ===\n');
  for (const scenario of ABLATION_SCENARIOS) {
    console.log(`  ${scenario.id}`);
    console.log(`    ${scenario.title}`);
    console.log(`    Level: ${scenario.level}, Turns: ${scenario.maxTurns}`);
    console.log(`    Topics: ${scenario.planStructure.nodes.length} nodes`);
    console.log('');
  }
}

// ============================================================================
// Scenario Validation
// ============================================================================

function validateScenario(scenario: AblationScenario): string[] {
  const errors: string[] = [];
  const planNodeIds = new Set(scenario.planStructure.nodes.map((node) => node.id));

  if (scenario.preTestQuestions.length === 0) {
    errors.push('No pre-test questions defined.');
  }
  if (scenario.postTestQuestions.length === 0) {
    errors.push('No post-test questions defined.');
  }
  if (scenario.preTestQuestions.length !== scenario.postTestQuestions.length) {
    errors.push(
      `Pre/post question count mismatch: pre=${scenario.preTestQuestions.length}, post=${scenario.postTestQuestions.length}.`,
    );
  }

  const allQuestions = [...scenario.preTestQuestions, ...scenario.postTestQuestions];
  for (const question of allQuestions) {
    if (!planNodeIds.has(question.topicId)) {
      errors.push(
        `Question "${question.id}" references unknown topicId "${question.topicId}" not present in plan nodes.`,
      );
    }
  }

  for (const gap of scenario.knowledgeGaps) {
    if (!planNodeIds.has(gap.topicId)) {
      errors.push(
        `Knowledge gap references unknown topicId "${gap.topicId}" not present in plan nodes.`,
      );
    }
    if (!Number.isFinite(gap.errorRate) || gap.errorRate < 0 || gap.errorRate > 1) {
      errors.push(
        `Knowledge gap "${gap.topicId}" has invalid errorRate=${String(gap.errorRate)}; expected 0..1.`,
      );
    }

    // Validate misconceptionDistractor index against the matching post-test question
    if (gap.misconceptionDistractor != null) {
      const postQ = scenario.postTestQuestions.find((q) => q.topicId === gap.topicId);
      if (postQ) {
        if (
          gap.misconceptionDistractor < 0 ||
          gap.misconceptionDistractor >= postQ.options.length
        ) {
          errors.push(
            `Knowledge gap "${gap.topicId}" has misconceptionDistractor=${gap.misconceptionDistractor} out of bounds [0, ${postQ.options.length - 1}].`,
          );
        }
        if (gap.misconceptionDistractor === postQ.correctIndex) {
          errors.push(
            `Knowledge gap "${gap.topicId}" has misconceptionDistractor=${gap.misconceptionDistractor} equal to correctIndex — distractor must differ from correct answer.`,
          );
        }
      }
    }
  }

  const gapTopicIds = new Set(scenario.knowledgeGaps.map((g) => g.topicId));
  if (gapTopicIds.size > 0) {
    const preGapCount = scenario.preTestQuestions.filter((q) => gapTopicIds.has(q.topicId)).length;
    const postGapCount = scenario.postTestQuestions.filter((q) =>
      gapTopicIds.has(q.topicId),
    ).length;
    if (preGapCount === 0) {
      errors.push(
        `Knowledge gaps are defined (${gapTopicIds.size}), but no pre-test questions target gap topics.`,
      );
    }
    if (postGapCount === 0) {
      errors.push(
        `Knowledge gaps are defined (${gapTopicIds.size}), but no post-test questions target gap topics.`,
      );
    }
  }

  return errors;
}

function assertValidScenarios(scenarios: AblationScenario[]): void {
  const errors: string[] = [];
  for (const scenario of scenarios) {
    for (const error of validateScenario(scenario)) {
      errors.push(`[${scenario.id}] ${error}`);
    }
  }

  if (errors.length === 0) return;

  console.error('\nError: Scenario configuration validation failed:');
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}

// ============================================================================
// Model Setup
// ============================================================================

function normalizeModelId(id: string): string {
  return id.trim().toLowerCase();
}

async function resolveReasoningSupportMap(
  modelIds: string[],
  apiKeys: { openrouter?: string },
): Promise<Record<string, boolean>> {
  const support: Record<string, boolean> = {};
  if (!apiKeys.openrouter) return support;

  const uniqueIds = Array.from(new Set(modelIds.map((id) => normalizeModelId(id)).filter(Boolean)));
  if (!uniqueIds.length) return support;

  try {
    const auth = createOpenRouterAccess({
      apiKey: apiKeys.openrouter,
      tier: 'developer',
      useProxy: false,
    }).auth;
    const models = await fetchModels(auth);
    const byId = new Map(models.map((model) => [normalizeModelId(model.id), model]));
    for (const id of uniqueIds) {
      const model = byId.get(id);
      support[id] = model ? isReasoningSupported(model) : false;
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(
      `Warning: Failed to fetch model capabilities for reasoning support (${reason}). ` +
        'Reasoning flags will be disabled for safety.',
    );
  }

  return support;
}

function supportsReasoning(modelId: string, support: Record<string, boolean>): boolean {
  return support[normalizeModelId(modelId)] ?? false;
}

function createStubModel(
  id: string,
  transport: ModelTransport,
  supportsTools: boolean,
  supportsReasoningFlag: boolean,
): ModelDescriptor {
  const supported: string[] = [];
  if (supportsTools) supported.push('tools');
  if (supportsReasoningFlag) supported.push('reasoning');
  return {
    id,
    name: id,
    transport,
    context_length: 16000,
    raw: { supported_parameters: supported },
  };
}

function resolveAuthFactory(keys: { openrouter?: string }) {
  return ({
    transport,
    modelId,
  }: {
    modelId: string;
    transport: ModelTransport;
  }): TransportAuth => {
    if (!keys.openrouter) {
      throw new Error(`Missing OPENROUTER_API_KEY for ${modelId}`);
    }
    if (transport === 'openrouter') {
      return createOpenRouterAccess({
        apiKey: keys.openrouter,
        tier: 'developer',
        useProxy: false,
      }).auth;
    }
    return buildTransportAuth({ transport, apiKey: keys.openrouter, useProxy: false });
  };
}

// ============================================================================
// Single Run Execution
// ============================================================================

async function runSingleAblation(
  scenario: AblationScenario,
  condition: AblationCondition,
  runIndex: number,
  runId: string,
  config: {
    tutorModel: string;
    studentModel: string;
    judgeModel: string;
    apiKeys: { openrouter?: string };
    reasoningSupport: Record<string, boolean>;
  },
): Promise<AblationRunResult> {
  const startTime = Date.now();

  console.log(`\n  [${runId}] Starting...`);

  const tutorTransport = resolveModelTransport(config.tutorModel) || 'openrouter';
  const studentTransport = resolveModelTransport(config.studentModel) || 'openrouter';
  const judgeTransport = resolveModelTransport(config.judgeModel) || 'openrouter';

  const resolveAuth = resolveAuthFactory(config.apiKeys);

  // Run pre-test (with knowledge gaps to simulate realistic student knowledge)
  console.log(`  [${runId}] Running pre-test...`);
  const errorSeed = generateErrorSeed(scenario.id, runIndex);
  const preTest = await administerTest(scenario.preTestQuestions, 'pre', {
    auth: resolveAuth({ modelId: config.studentModel, transport: studentTransport }),
    model: config.studentModel,
    studentPersona: scenario.studentPersona,
    priorKnowledge: `Level: ${scenario.level}. Topic: ${scenario.topic}`,
    testType: 'pre',
    knowledgeGaps: scenario.knowledgeGaps, // Student has gaps before tutoring
    runId, // For deterministic seeding
    errorSeed, // Condition-independent seed for consistent pre-test realizations
  });
  console.log(`  [${runId}] Pre-test score: ${preTest.score.toFixed(1)}%`);

  // Setup chat with condition-specific settings
  const conditionSettings = getConditionSettings(condition);
  const initialPlan = generatePlanFromScenario(scenario);

  const chat: Chat = {
    id: `chat_${runId}`,
    title: `${scenario.title} - ${condition}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    settings: {
      modelId: config.tutorModel,
      system: DEFAULT_BASE_SYSTEM,
      generation: {},
      ui: {
        showThinkingByDefault: false,
        showStats: false,
        showToolCallLog: true,
        showDebugRawJson: true,
      },
      features: {
        search: { enabled: false, provider: 'openrouter' },
        tutor: {
          enabled: true,
          defaultModelId: config.tutorModel,
          learningPlan: initialPlan,
          ...(conditionSettings.features?.tutor ?? {}),
        },
      },
    },
  };

  const models: ModelDescriptor[] = [
    createStubModel(
      config.tutorModel,
      tutorTransport,
      true,
      supportsReasoning(config.tutorModel, config.reasoningSupport),
    ),
    createStubModel(
      config.studentModel,
      studentTransport,
      false,
      supportsReasoning(config.studentModel, config.reasoningSupport),
    ),
    createStubModel(
      config.judgeModel,
      judgeTransport,
      false,
      supportsReasoning(config.judgeModel, config.reasoningSupport),
    ),
  ];
  const modelIndex = createModelIndex(models);

  const runner = createHeadlessRunner({
    chat,
    models,
    modelIndex,
    resolveAuth,
    uiOverrides: {
      debug: { mode: true },
      flags: { experimentalTutor: true },
      tutor: {
        forceMode: true,
        researchMode: conditionSettings.features?.tutor?.researchMode,
      },
      overrides: { tutorMode: true },
    },
  });

  // Setup student simulator with condition-independent realistic behaviors.
  // Students are given natural motivations (via persona/constraints) to request
  // curriculum changes and mastery corrections, but are NOT told whether the system
  // can act on these requests. The same behaviors occur across all conditions;
  // only the system's ability to respond differs.
  const conditionConfig = CONDITION_CONFIGS[condition];
  const realisticStudentBehaviors = [
    'As a realistic student, you should naturally:',
    '- If you already know a topic, tell the tutor you want to skip it or move faster',
    '- If you think topics should be covered in a different order, suggest a change',
    '- If a topic feels irrelevant to your goal or exam, say so and ask to skip it',
    '- Ask to spend more time on topics you find difficult or important',
    '- If the tutor over- or under-estimates your knowledge level, correct them directly',
    '- Express frustration if coverage feels redundant or too slow for your needs',
    'Act on these when your persona and constraints call for it — do not force them every turn.',
  ].join('\n');

  const studentSim = new LLMUserSimulator({
    modelId: config.studentModel,
    auth: resolveAuth({ modelId: config.studentModel, transport: studentTransport }),
    personaPrompt: [
      'You are a student in a tutoring session.',
      `Topic: ${scenario.topic} (${scenario.level})`,
      `Goal: ${scenario.goal}`,
      `Persona: ${scenario.studentPersona}`,
      `Your pre-test score was ${preTest.score.toFixed(0)}%.`,
      'You are an active, opinionated learner — not a passive recipient. Respond naturally, ask questions when confused, push back when something feels off, and occasionally make mistakes fitting your persona.',
      scenario.constraints?.length ? `Constraints: ${scenario.constraints.join('; ')}` : '',
      '',
      realisticStudentBehaviors,
    ]
      .filter(Boolean)
      .join('\n'),
    temperature: 0.7,
    knowledgeGaps: scenario.knowledgeGaps.map((gap) => ({
      topicId: gap.topicId,
      misconception: gap.misconception,
    })),
  });

  // Run tutoring session
  console.log(`  [${runId}] Running tutoring session (${scenario.maxTurns} turns)...`);
  let studentMessage = `Hi! I need help with ${scenario.topic}. My goal is: ${scenario.goal}`;
  const masteryTrajectory: Array<{ turn: number; avgConfidence: number }> = [];

  for (let turn = 0; turn < scenario.maxTurns; turn++) {
    const snapshot = await runner.runTurn({ content: studentMessage, turnIndex: turn });

    // Track mastery trajectory
    const learnerModel = getLatestLearnerModel(runner.toResult().messages);
    if (learnerModel?.mastery) {
      const confidences = Object.values(learnerModel.mastery).map((m) => m.confidence);
      const avgConfidence =
        confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;
      masteryTrajectory.push({ turn: turn + 1, avgConfidence });
    }

    if (turn === scenario.maxTurns - 1) break;

    const tutorMessage = snapshot.assistant.content;
    const currentPlan =
      runner
        .getSession()
        .getState()
        .chats.find((c) => c.id === chat.id)?.settings.features.tutor.learningPlan ?? initialPlan;
    const latestLearnerModel = getLatestLearnerModel(runner.toResult().messages);
    const planSummary = conditionConfig.planVisible
      ? currentPlan
        ? summarizeLearningPlan(currentPlan)
        : undefined
      : undefined;
    const learnerModelSummary =
      conditionConfig.learnerModelVisible && currentPlan && latestLearnerModel
        ? generateModelSummary(latestLearnerModel, currentPlan)
        : undefined;

    studentMessage = await studentSim.respond(tutorMessage, {
      planSummary,
      planEditable: conditionConfig.planEditable,
      learnerModelSummary,
      learnerModelEditable: conditionConfig.learnerModelEditable,
      turn,
    });
  }

  const result = runner.toResult();
  console.log(`  [${runId}] Session complete. ${result.snapshots.length} turns.`);

  // Run post-test (student checks transcript to see if gaps were closed)
  console.log(`  [${runId}] Running post-test...`);
  const transcript = renderSnapshotTranscript(result.snapshots, { includeHiddenContent: false });

  const postTest = await administerTest(scenario.postTestQuestions, 'post', {
    auth: resolveAuth({ modelId: config.studentModel, transport: studentTransport }),
    model: config.studentModel,
    studentPersona: scenario.studentPersona,
    priorKnowledge: `Just completed tutoring on ${scenario.topic}.`,
    testType: 'post',
    knowledgeGaps: scenario.knowledgeGaps, // Pass gaps so the simulator knows what to check against the transcript
    sessionTranscript: transcript,
    runId, // For deterministic seeding
    errorSeed, // Condition-independent seed for consistent post-test realizations
  });
  console.log(`  [${runId}] Post-test score: ${postTest.score.toFixed(1)}%`);

  // Calculate learning gain
  const learningGain = postTest.score - preTest.score;
  const normalizedGain = calculateLearningGain(preTest.score, postTest.score);

  // Calculate gap-only learning gain
  const gapPreScore = preTest.gapScore ?? preTest.score;
  const gapPostScore = postTest.gapScore ?? postTest.score;
  const gapLearningGain = gapPostScore - gapPreScore;
  const gapNormalizedGain = calculateLearningGain(gapPreScore, gapPostScore);

  // Collect tool usage
  const toolUsage: Record<string, number> = {};
  for (const snap of result.snapshots) {
    for (const tc of snap.assistant.toolCalls || []) {
      toolUsage[tc.name] = (toolUsage[tc.name] || 0) + 1;
    }
  }

  // Extract edit events (plan modifications, mastery overrides)
  const editEvents = extractEditEvents(result.snapshots, {
    planEditable: conditionConfig.planEditable,
    planPreGenerated: true,
  });
  if (editEvents.length > 0) {
    console.log(
      `  [${runId}] Edit events: ${editEvents.length} (${editEvents.map((e) => e.type).join(', ')})`,
    );
  }

  // Get final learner model
  const finalLearnerModel = getLatestLearnerModel(result.messages);

  // Run judge evaluation
  console.log(`  [${runId}] Running judge evaluation...`);

  const judgeMessages = buildJudgeMessages({
    scenario,
    transcript,
    knowledgeGaps: scenario.knowledgeGaps,
  });

  const judgeResponse = await getChatCompletion()({
    auth: resolveAuth({ modelId: config.judgeModel, transport: judgeTransport }),
    model: config.judgeModel,
    messages: judgeMessages,
    temperature: 0,
    maxTokens: 2048,
  });

  const judgeRaw = extractJudgeText(judgeResponse);
  const judgeVerdict = parseJudgeVerdict(judgeRaw);

  // Recompute overall_score from subscores using canonical weights
  // instead of trusting the LLM's arithmetic
  if (judgeVerdict?.subscores) {
    let recomputed = 0;
    for (const [dim, weight] of Object.entries(JUDGE_WEIGHTS)) {
      const score = judgeVerdict.subscores[dim as keyof typeof JUDGE_WEIGHTS];
      if (score != null) recomputed += score * weight;
    }
    judgeVerdict.overall_score = recomputed;
  }

  const durationMs = Date.now() - startTime;
  console.log(
    `  [${runId}] Complete. Gain: ${learningGain >= 0 ? '+' : ''}${learningGain.toFixed(1)}%, ` +
      `Normalized: ${(normalizedGain * 100).toFixed(1)}%, ` +
      `Duration: ${(durationMs / 1000).toFixed(1)}s`,
  );

  return {
    id: runId,
    condition,
    scenario: scenario.id,
    runIndex,
    preTest,
    postTest,
    learningGain,
    normalizedGain,
    gapLearningGain,
    gapNormalizedGain,
    transcript,
    turnsUsed: result.snapshots.length,
    toolUsage,
    editEvents,
    finalLearnerModel,
    masteryTrajectory,
    judgeVerdict,
    judgeRaw,
    durationMs,
    completedAt: Date.now(),
  };
}

function extractJudgeText(response: unknown): string {
  if (!response || typeof response !== 'object') return '';
  const resp = response as { choices?: Array<{ message?: { content?: unknown } }> };
  const content = resp.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((c) => (typeof c === 'string' ? c : (c?.text ?? ''))).join('');
  }
  return '';
}

function parseJudgeVerdict(raw: string): JudgeVerdict | undefined {
  // Find the first balanced {...} block using brace counting
  const start = raw.indexOf('{');
  if (start === -1) return undefined;

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(raw.slice(start, i + 1)) as JudgeVerdict;
        } catch {
          return undefined;
        }
      }
    }
  }
  return undefined;
}

/**
 * Extract edit events from session snapshots.
 * Tracks when plan modifications or mastery overrides occur.
 */
function extractEditEvents(
  snapshots: HeadlessTurnSnapshot[],
  options?: { planEditable?: boolean; planPreGenerated?: boolean },
): EditEvent[] {
  const events: EditEvent[] = [];
  const planEventsAllowed = options?.planEditable !== false;
  // If the plan was pre-generated (ablation mode), the first learning_plan call
  // is an edit, not initial generation.
  let initialPlanGenerated = options?.planPreGenerated === true;

  const looksLikePlanEditRequest = (text: string | undefined): boolean => {
    if (!text) return false;
    return /\b(skip|remove|drop|don't need|add|insert|reorder|change order|move|swap|different order|edit plan|update plan|modify plan|adjust plan|change the plan|already know|already understand|already covered|already learned|jump ahead|jump to|go straight to|get straight to|not on the exam|not on my exam|not on the midterm|not tested|not relevant|not important|focus on|focus more|spend more time|spend less time|too basic|too easy|too simple|waste of time|redundant)\b/i.test(
      text,
    );
  };

  const looksLikeModelOverrideRequest = (text: string | undefined): boolean => {
    if (!text) return false;
    return /\b(too high|too low|overestimating|underestimating|I already know|I know this|I don't know|my mastery|my confidence|adjust|update|actually good at|actually understand|better than you think|not as weak|still confused|still don't get|still don't understand|still struggling|that was too easy|that was too hard|stronger than|weaker than|misjudging|wrong about my|know more than|know less than)\b/i.test(
      text,
    );
  };

  for (let i = 0; i < snapshots.length; i++) {
    const snap = snapshots[i];
    const userContent = snap.user?.content;
    const userRequestedPlanChange = looksLikePlanEditRequest(userContent);
    const userRequestedModelOverride = looksLikeModelOverrideRequest(userContent);
    const toolCalls = snap.assistant.toolCalls || [];

    for (const tc of toolCalls) {
      const input = tc.input || {};
      const isLearningPlan = tc.name === 'learning_plan';
      const isFirstPlanGeneration = isLearningPlan && !initialPlanGenerated;
      if (isLearningPlan) initialPlanGenerated = true;
      const succeeded = (tc.status ?? 'success') === 'success';

      // Skip failed tool calls
      if (!succeeded) continue;

      // Plan modification via learning_plan tool
      if (planEventsAllowed && isLearningPlan) {
        // Tutor auto-generates the initial plan; ignore that so we only count learner-driven edits.
        if (isFirstPlanGeneration) continue;
        if (!userRequestedPlanChange) continue;

        events.push({
          turn: i + 1,
          type: 'plan_modification',
          toolName: tc.name,
          details: (input.rationale as string) || undefined,
        });
      }

      // Mastery override via record_learning tool
      if (tc.name === 'record_learning') {
        const source = input.source as string | undefined;
        const notes = input.notes as string | undefined;
        const adjustment = input.confidenceAdjustment as
          | { direction?: string; reason?: string }
          | undefined;

        // Count all self_report source calls (student-initiated feedback)
        const isSelfReport = source === 'self_report';
        if (isSelfReport) {
          events.push({
            turn: i + 1,
            type: 'mastery_override',
            toolName: tc.name,
            nodeId: input.nodeId as string | undefined,
            details:
              adjustment?.reason ||
              notes ||
              (adjustment?.direction ? `${adjustment.direction} adjustment` : undefined),
          });
        }
      }
    }
  }

  return events;
}

// ============================================================================
// Multiple Comparison Correction
// ============================================================================

/**
 * Holm-Bonferroni step-down correction for a family of p-values.
 * Returns adjusted p-values that control the family-wise error rate.
 * The adjusted p for rank i = max(p_j * (m - j + 1)) for j = 1..i,
 * capped at 1.0 and enforcing monotonicity.
 */
function holmBonferroni(pValues: number[]): number[] {
  const m = pValues.length;
  if (m === 0) return [];

  // Create indexed array and sort by raw p ascending
  const indexed = pValues.map((p, i) => ({ p, i }));
  indexed.sort((a, b) => a.p - b.p);

  const adjusted = new Array<number>(m);
  let runningMax = 0;
  for (let rank = 0; rank < m; rank++) {
    const corrected = indexed[rank].p * (m - rank);
    runningMax = Math.max(runningMax, corrected);
    adjusted[indexed[rank].i] = Math.min(runningMax, 1);
  }

  return adjusted;
}

// ============================================================================
// Statistics Calculation
// ============================================================================

function calculateStatistics(
  results: AblationRunResult[],
  conditions: AblationCondition[],
): AblationSummary['statistics'] {
  const byCondition = {} as AblationSummary['statistics']['byCondition'];

  for (const condition of conditions) {
    const conditionResults = results.filter((r) => r.condition === condition);
    const gains = conditionResults.map((r) => r.learningGain);
    const normalizedGains = conditionResults.map((r) => r.normalizedGain);
    const gapGains = conditionResults.map((r) => r.gapLearningGain);
    const gapNormalizedGains = conditionResults.map((r) => r.gapNormalizedGain);
    const turns = conditionResults.map((r) => r.turnsUsed);
    const judgeScores = judgeScoresForCondition(results, condition);

    // Compute per-dimension judge subscores
    const judgeSubscores: Record<string, ReturnType<typeof calculateStats>> = {};
    for (const dim of JUDGE_DIMENSIONS) {
      const dimScores = conditionResults
        .filter((r) => r.judgeVerdict?.subscores?.[dim] != null)
        .map((r) => r.judgeVerdict!.subscores[dim]);
      judgeSubscores[dim] = calculateStats(dimScores);
    }

    // Compute mechanism metrics
    const planEditsCount = conditionResults.reduce(
      (sum, r) => sum + r.editEvents.filter((e) => e.type === 'plan_modification').length,
      0,
    );
    const masteryOverridesCount = conditionResults.reduce(
      (sum, r) => sum + r.editEvents.filter((e) => e.type === 'mastery_override').length,
      0,
    );
    const advanceTopicCount = conditionResults.reduce(
      (sum, r) => sum + (r.toolUsage['advance_topic'] ?? 0),
      0,
    );
    const runsWithAdvanceTopic = conditionResults.filter(
      (r) => (r.toolUsage['advance_topic'] ?? 0) > 0,
    ).length;

    const gapEvidenceAttempts = conditionResults.flatMap((r) =>
      (r.postTest.answerMetadata ?? []).filter(
        (m) => m?.evidenceQuote !== undefined || m?.jsonParseFailed === true,
      ),
    );
    const gapEvidenceVerifiedCount = gapEvidenceAttempts.filter((m) => m.evidenceVerified).length;
    const gapEvidenceJsonParseFailedCount = gapEvidenceAttempts.filter(
      (m) => m.jsonParseFailed,
    ).length;
    const gapEvidenceTotal = gapEvidenceAttempts.length;
    const runsWithPlanEdits = conditionResults.filter((r) =>
      r.editEvents.some((e) => e.type === 'plan_modification'),
    ).length;
    const runsWithMasteryOverrides = conditionResults.filter((r) =>
      r.editEvents.some((e) => e.type === 'mastery_override'),
    ).length;

    byCondition[condition] = {
      learningGain: calculateStats(gains),
      normalizedGain: calculateStats(normalizedGains),
      gapLearningGain: calculateStats(gapGains),
      gapNormalizedGain: calculateStats(gapNormalizedGains),
      turnsUsed: calculateStats(turns),
      judgeScore: calculateStats(judgeScores),
      judgeSubscores,
      mechanismMetrics: {
        planEditsCount,
        masteryOverridesCount,
        advanceTopicCount,
        runsWithAdvanceTopic,
        gapEvidenceVerifiedCount,
        gapEvidenceTotal,
        gapEvidenceJsonParseFailedCount,
        runsWithPlanEdits,
        runsWithMasteryOverrides,
      },
    };
  }

  // Calculate comparisons with t-tests (using gap-only metrics as primary)
  const comparisons = COMPARISON_PAIRS.filter(
    (p) => conditions.includes(p.conditions[0]) && conditions.includes(p.conditions[1]),
  ).map((pair) => {
    const [c1, c2] = pair.conditions;

    // Overall metrics
    const gains1 = results.filter((r) => r.condition === c1).map((r) => r.normalizedGain);
    const gains2 = results.filter((r) => r.condition === c2).map((r) => r.normalizedGain);
    const { d, interpretation } = calculateCohenD(gains1, gains2);
    const tTest = welchTTest(gains1, gains2);

    // Gap-only metrics (primary for hypothesis testing)
    const gapGains1 = results.filter((r) => r.condition === c1).map((r) => r.gapNormalizedGain);
    const gapGains2 = results.filter((r) => r.condition === c2).map((r) => r.gapNormalizedGain);
    const { d: gapD, interpretation: gapInterpretation } = calculateCohenD(gapGains1, gapGains2);
    const gapTTest = welchTTest(gapGains1, gapGains2);

    // Judge score comparison
    const judgeScores1 = judgeScoresForCondition(results, c1);
    const judgeScores2 = judgeScoresForCondition(results, c2);
    const { d: judgeD, interpretation: judgeInterpretation } = calculateCohenD(
      judgeScores1,
      judgeScores2,
    );
    const judgeTTest = welchTTest(judgeScores1, judgeScores2);

    return {
      name: pair.name,
      hypothesis: pair.hypothesis,
      cohenD: d,
      interpretation,
      condition1Mean: mean(gains1),
      condition2Mean: mean(gains2),
      tTest,
      adjustedP: tTest.p, // raw p; Holm-Bonferroni applied below when m > 1
      gapCohenD: gapD,
      gapInterpretation,
      gapCondition1Mean: mean(gapGains1),
      gapCondition2Mean: mean(gapGains2),
      gapTTest,
      gapAdjustedP: gapTTest.p, // raw p; Holm-Bonferroni applied below when m > 1
      judgeCohenD: judgeD,
      judgeInterpretation,
      judgeTTest,
      judgeAdjustedP: judgeTTest.p, // raw p; Holm-Bonferroni applied below when m > 1
    };
  });

  // Apply Holm-Bonferroni correction to each family of comparisons
  if (comparisons.length > 1) {
    const overallAdj = holmBonferroni(comparisons.map((c) => c.tTest.p));
    const gapAdj = holmBonferroni(comparisons.map((c) => c.gapTTest.p));
    const judgeAdj = holmBonferroni(comparisons.map((c) => c.judgeTTest.p));
    for (let i = 0; i < comparisons.length; i++) {
      comparisons[i].adjustedP = overallAdj[i];
      comparisons[i].gapAdjustedP = gapAdj[i];
      comparisons[i].judgeAdjustedP = judgeAdj[i];
    }
  }

  // Calculate interaction effect and ANOVA when all 4 conditions are present
  let interactionEffect = 0;
  let anova: AnovaResult | undefined;
  let anovaJudge: AnovaResult | undefined;

  const hasAllConditions =
    conditions.includes('full_system') &&
    conditions.includes('plan_only') &&
    conditions.includes('model_only') &&
    conditions.includes('baseline');

  if (hasAllConditions) {
    interactionEffect = calculateInteractionEffect({
      full_system: byCondition.full_system?.gapNormalizedGain.mean ?? 0,
      plan_only: byCondition.plan_only?.gapNormalizedGain.mean ?? 0,
      model_only: byCondition.model_only?.gapNormalizedGain.mean ?? 0,
      baseline: byCondition.baseline?.gapNormalizedGain.mean ?? 0,
    });

    // Run 2-way ANOVA on gap-normalized gain
    anova = twoWayAnova({
      fullSystem: results
        .filter((r) => r.condition === 'full_system')
        .map((r) => r.gapNormalizedGain),
      planOnly: results.filter((r) => r.condition === 'plan_only').map((r) => r.gapNormalizedGain),
      modelOnly: results
        .filter((r) => r.condition === 'model_only')
        .map((r) => r.gapNormalizedGain),
      baseline: results.filter((r) => r.condition === 'baseline').map((r) => r.gapNormalizedGain),
    });

    // Run 2-way ANOVA on judge overall scores only when each cell has enough parsed data.
    const judgeAnovaGroups = {
      fullSystem: judgeScoresForCondition(results, 'full_system'),
      planOnly: judgeScoresForCondition(results, 'plan_only'),
      modelOnly: judgeScoresForCondition(results, 'model_only'),
      baseline: judgeScoresForCondition(results, 'baseline'),
    };
    const hasEnoughJudgeScores = Object.values(judgeAnovaGroups).every(
      (scores) => scores.length >= 2,
    );
    if (hasEnoughJudgeScores) {
      anovaJudge = twoWayAnova(judgeAnovaGroups);
    }
  }

  return { byCondition, comparisons, interactionEffect, anova, anovaJudge };
}

// ============================================================================
// Output Generation
// ============================================================================

async function saveResults(summary: AblationSummary, outputDir: string): Promise<void> {
  await fs.mkdir(outputDir, { recursive: true });

  // Save full JSON
  const jsonPath = path.join(outputDir, 'ablation-summary.json');
  await fs.writeFile(jsonPath, JSON.stringify(summary, null, 2));
  console.log(`\nSaved full results to: ${jsonPath}`);

  // Generate markdown tables
  const tablesPath = path.join(outputDir, 'ablation-tables.md');
  const tables = generateMarkdownTables(summary);
  await fs.writeFile(tablesPath, tables);
  console.log(`Saved tables to: ${tablesPath}`);

  // Generate stats summary
  const statsPath = path.join(outputDir, 'ablation-stats.md');
  const stats = generateStatsReport(summary);
  await fs.writeFile(statsPath, stats);
  console.log(`Saved statistics to: ${statsPath}`);
}

/**
 * Format the common rows of a 2-way ANOVA table (header + three effect rows).
 */
function formatAnovaTable(anova: AnovaResult): string[] {
  function row(label: string, effect: AnovaEffect): string {
    return `| ${label} | ${effect.f.toFixed(3)} | ${effect.p.toFixed(4)} | ${effect.etaSquared.toFixed(3)} | ${effect.significant ? '*' : ''} |`;
  }
  return [
    '| Source | F | p-value | η²_p | Sig. |',
    '|--------|---|---------|------|------|',
    row('Plan (main effect)', anova.planEffect),
    row('Model (main effect)', anova.modelEffect),
    row('Plan × Model (interaction)', anova.interaction),
  ];
}

function generateMarkdownTables(summary: AblationSummary): string {
  const lines: string[] = [
    '# Ablation Study Results',
    '',
    `Generated: ${new Date(summary.completedAt).toISOString()}`,
    `Total runs: ${summary.completedRuns}/${summary.totalRuns}`,
    '',
    '## Learning Gains by Condition',
    '',
    '| Condition | Learning Gain | Normalized Gain | 95% CI (Norm. Gain) | Turns Used | Judge Score |',
    '|-----------|--------------|-----------------|---------------------|------------|-------------|',
  ];

  for (const condition of summary.config.conditions) {
    const stats = summary.statistics.byCondition[condition];
    if (!stats) continue;
    const judgeScoreCell =
      stats.judgeScore.n > 0
        ? `${stats.judgeScore.mean.toFixed(2)} ± ${stats.judgeScore.sd.toFixed(2)}`
        : 'N/A';
    const ng = stats.normalizedGain;
    const ciCell =
      ng.n >= 2
        ? `[${(ng.ci95Lower * 100).toFixed(1)}, ${(ng.ci95Upper * 100).toFixed(1)}]%`
        : 'N/A';
    lines.push(
      `| ${condition} | ${stats.learningGain.mean.toFixed(1)} ± ${stats.learningGain.sd.toFixed(1)} | ` +
        `${(ng.mean * 100).toFixed(1)}% ± ${(ng.sd * 100).toFixed(1)}% | ` +
        `${ciCell} | ` +
        `${stats.turnsUsed.mean.toFixed(1)} ± ${stats.turnsUsed.sd.toFixed(1)} | ` +
        `${judgeScoreCell} |`,
    );
  }

  lines.push(
    '',
    "## Pairwise Comparisons (Welch's t-test)",
    '',
    "| Comparison | Cohen's d | Interp. | t | df | p-value | Adj. p | Sig. | C1 Mean | C2 Mean | 95% CI (Diff) |",
    '|------------|-----------|---------|---|---------|--------|--------|------|---------|---------|---------------|',
  );

  for (const comp of summary.statistics.comparisons) {
    const sig = comp.adjustedP < 0.05 ? '*' : '';
    const ci = `[${(comp.tTest.ciLower * 100).toFixed(1)}, ${(comp.tTest.ciUpper * 100).toFixed(1)}]`;
    lines.push(
      `| ${comp.name} | ${comp.cohenD.toFixed(3)} | ${comp.interpretation} | ` +
        `${comp.tTest.t.toFixed(3)} | ${comp.tTest.df.toFixed(1)} | ${comp.tTest.p.toFixed(4)} | ${comp.adjustedP.toFixed(4)} | ${sig} | ` +
        `${(comp.condition1Mean * 100).toFixed(1)}% | ${(comp.condition2Mean * 100).toFixed(1)}% | ${ci} |`,
    );
  }

  if (summary.statistics.anova) {
    const anova = summary.statistics.anova;
    lines.push(
      '',
      '## 2-Way ANOVA (Plan × Model, Gap-Normalized Gain)',
      '',
      ...formatAnovaTable(anova),
      '',
      `Residual MS: ${anova.residualMS.toFixed(6)}`,
      '',
      '> \\* p < 0.05',
    );
  }

  if (summary.statistics.interactionEffect !== 0) {
    lines.push(
      '',
      '## Interaction Effect (Descriptive, Gap-Normalized Gain)',
      '',
      `Plan × Model Interaction: ${(summary.statistics.interactionEffect * 100).toFixed(2)}%`,
      '',
      '> Positive value indicates synergy between plan and learner model editability.',
    );
  }

  // Judge scores by condition and dimension
  lines.push(
    '',
    '## Judge Scores by Condition and Dimension',
    '',
    `| Condition | Overall | ${JUDGE_DIMENSIONS.join(' | ')} |`,
    `|-----------|---------|${JUDGE_DIMENSIONS.map(() => '---').join('|')}|`,
  );

  for (const condition of summary.config.conditions) {
    const stats = summary.statistics.byCondition[condition];
    if (!stats) continue;
    const overallJudgeCell =
      stats.judgeScore.n > 0
        ? `${stats.judgeScore.mean.toFixed(2)}±${stats.judgeScore.sd.toFixed(2)}`
        : 'N/A';
    const dimCells = JUDGE_DIMENSIONS.map((dim) => {
      const s = stats.judgeSubscores[dim];
      return s && s.n > 0 ? `${s.mean.toFixed(2)}±${s.sd.toFixed(2)}` : 'N/A';
    }).join(' | ');
    lines.push(`| ${condition} | ${overallJudgeCell} | ${dimCells} |`);
  }

  // Judge score pairwise comparisons
  lines.push(
    '',
    "## Judge Score Pairwise Comparisons (Welch's t-test)",
    '',
    "| Comparison | Judge Cohen's d | Interp. | t | df | p-value | Adj. p | Sig. | 95% CI (Diff) |",
    '|------------|----------------|---------|---|---------|--------|--------|------|---------------|',
  );

  for (const comp of summary.statistics.comparisons) {
    const sig = comp.judgeAdjustedP < 0.05 ? '*' : '';
    const ci = `[${comp.judgeTTest.ciLower.toFixed(3)}, ${comp.judgeTTest.ciUpper.toFixed(3)}]`;
    lines.push(
      `| ${comp.name} | ${comp.judgeCohenD.toFixed(3)} | ${comp.judgeInterpretation} | ` +
        `${comp.judgeTTest.t.toFixed(3)} | ${comp.judgeTTest.df.toFixed(1)} | ${comp.judgeTTest.p.toFixed(4)} | ${comp.judgeAdjustedP.toFixed(4)} | ${sig} | ${ci} |`,
    );
  }

  // Judge ANOVA
  if (summary.statistics.anovaJudge) {
    lines.push(
      '',
      '## 2-Way ANOVA (Plan × Model, Judge Overall Score)',
      '',
      ...formatAnovaTable(summary.statistics.anovaJudge),
    );
  }

  // Mechanism metrics table
  lines.push(
    '',
    '## Mechanism Metrics by Condition',
    '',
    '| Condition | Plan Edits | Mastery Overrides | Advance Topic | Evidence Verified | JSON Failures | Runs w/ Edits | Runs w/ Overrides | Runs w/ Advance |',
    '|-----------|------------|-------------------|---------------|-------------------|--------------|---------------|-------------------|-----------------|',
  );

  for (const condition of summary.config.conditions) {
    const stats = summary.statistics.byCondition[condition];
    if (!stats) continue;
    const m = stats.mechanismMetrics;
    const evidenceRate =
      m.gapEvidenceTotal > 0
        ? `${m.gapEvidenceVerifiedCount}/${m.gapEvidenceTotal} (${((m.gapEvidenceVerifiedCount / m.gapEvidenceTotal) * 100).toFixed(0)}%)`
        : 'N/A';
    const jsonFailureRate =
      m.gapEvidenceTotal > 0
        ? `${m.gapEvidenceJsonParseFailedCount}/${m.gapEvidenceTotal} (${((m.gapEvidenceJsonParseFailedCount / m.gapEvidenceTotal) * 100).toFixed(0)}%)`
        : 'N/A';
    lines.push(
      `| ${condition} | ${m.planEditsCount} | ${m.masteryOverridesCount} | ${m.advanceTopicCount} | ${evidenceRate} | ${jsonFailureRate} | ${m.runsWithPlanEdits} | ${m.runsWithMasteryOverrides} | ${m.runsWithAdvanceTopic} |`,
    );
  }

  // Gap-Only Learning Gains table (primary outcome measure)
  lines.push(
    '',
    '## Gap-Only Learning Gains by Condition (Primary Outcome)',
    '',
    '> Gap-only metrics focus on knowledge gap topics, providing a more sensitive measure of tutoring effectiveness.',
    '',
    '| Condition | Gap Learning Gain | Gap Normalized Gain | 95% CI (Gap Norm.) |',
    '|-----------|------------------|---------------------|---------------------|',
  );

  for (const condition of summary.config.conditions) {
    const stats = summary.statistics.byCondition[condition];
    if (!stats) continue;
    const gn = stats.gapNormalizedGain;
    const ciCell =
      gn.n >= 2
        ? `[${(gn.ci95Lower * 100).toFixed(1)}, ${(gn.ci95Upper * 100).toFixed(1)}]%`
        : 'N/A';
    lines.push(
      `| ${condition} | ${stats.gapLearningGain.mean.toFixed(1)} ± ${stats.gapLearningGain.sd.toFixed(1)} | ` +
        `${(gn.mean * 100).toFixed(1)}% ± ${(gn.sd * 100).toFixed(1)}% | ${ciCell} |`,
    );
  }

  // Gap-Only Pairwise Comparisons table
  lines.push(
    '',
    "## Gap-Only Pairwise Comparisons (Welch's t-test)",
    '',
    "| Comparison | Gap Cohen's d | Interp. | t | df | p-value | Adj. p | Sig. | Gap C1 Mean | Gap C2 Mean | 95% CI (Diff) |",
    '|------------|--------------|---------|---|---------|--------|--------|------|-------------|-------------|---------------|',
  );

  for (const comp of summary.statistics.comparisons) {
    const sig = comp.gapAdjustedP < 0.05 ? '*' : '';
    const ci = `[${(comp.gapTTest.ciLower * 100).toFixed(1)}, ${(comp.gapTTest.ciUpper * 100).toFixed(1)}]`;
    lines.push(
      `| ${comp.name} | ${comp.gapCohenD.toFixed(3)} | ${comp.gapInterpretation} | ` +
        `${comp.gapTTest.t.toFixed(3)} | ${comp.gapTTest.df.toFixed(1)} | ${comp.gapTTest.p.toFixed(4)} | ${comp.gapAdjustedP.toFixed(4)} | ${sig} | ` +
        `${(comp.gapCondition1Mean * 100).toFixed(1)}% | ${(comp.gapCondition2Mean * 100).toFixed(1)}% | ${ci} |`,
    );
  }

  return lines.join('\n');
}

function generateStatsReport(summary: AblationSummary): string {
  const lines: string[] = [
    '# Statistical Analysis Report',
    '',
    '## Study Configuration',
    '',
    `- Conditions: ${summary.config.conditions.join(', ')}`,
    `- Scenarios: ${summary.config.scenarios.join(', ')}`,
    `- Runs per cell: ${summary.config.runsPerCell}`,
    `- Tutor model: ${summary.config.tutorModel}`,
    '- Primary outcome: Gap-only normalized gain (gap-topic post-test answers require verified transcript evidence)',
    '- Multiple comparison correction: Holm-Bonferroni (applied separately to overall, gap, and judge comparison families)',
    '- Confidence intervals: 95% CIs for means (t-distribution) and mean differences (Welch t)',
    '- Effect size: Partial eta-squared (η²_p) for ANOVA effects',
    '',
    "## Effect Size Interpretation (Cohen's d)",
    '',
    '- |d| < 0.2: Negligible',
    '- |d| < 0.5: Small',
    '- |d| < 0.8: Medium',
    '- |d| ≥ 0.8: Large',
    '',
    '## Key Findings',
    '',
  ];

  // Find significant comparisons
  const notableComparisons = summary.statistics.comparisons.filter(
    (c) => c.gapInterpretation === 'medium' || c.gapInterpretation === 'large',
  );

  if (notableComparisons.length > 0) {
    lines.push('### Notable Effect Sizes (Gap-Only):', '');
    for (const comp of notableComparisons) {
      lines.push(
        `- **${comp.name}**: d = ${comp.gapCohenD.toFixed(3)} (${comp.gapInterpretation})`,
        `  - ${comp.hypothesis}`,
        '',
      );
    }
  } else {
    lines.push('No comparisons showed medium or large effect sizes.', '');
  }

  // ANOVA interpretation
  if (summary.statistics.anova) {
    const anova = summary.statistics.anova;
    lines.push('### 2-Way ANOVA Results', '');

    const effects: string[] = [];
    if (anova.planEffect.significant) {
      effects.push(
        `Plan editability shows a significant main effect (F = ${anova.planEffect.f.toFixed(2)}, p = ${anova.planEffect.p.toFixed(4)}, η²_p = ${anova.planEffect.etaSquared.toFixed(3)}), ` +
          'indicating that curriculum editability affects learning outcomes independent of learner model editability.',
      );
    }
    if (anova.modelEffect.significant) {
      effects.push(
        `Learner model editability shows a significant main effect (F = ${anova.modelEffect.f.toFixed(2)}, p = ${anova.modelEffect.p.toFixed(4)}, η²_p = ${anova.modelEffect.etaSquared.toFixed(3)}), ` +
          'indicating that mastery editability affects learning outcomes independent of plan editability.',
      );
    }
    if (anova.interaction.significant) {
      effects.push(
        `The interaction is significant (F = ${anova.interaction.f.toFixed(2)}, p = ${anova.interaction.p.toFixed(4)}, η²_p = ${anova.interaction.etaSquared.toFixed(3)}), ` +
          'indicating that the effect of one factor depends on the presence of the other.',
      );
    }

    if (effects.length > 0) {
      lines.push(...effects.map((e) => `- ${e}`), '');
    } else {
      lines.push('No significant main effects or interaction were detected at α = 0.05.', '');
    }
  }

  // Interaction effect interpretation (descriptive)
  if (summary.statistics.interactionEffect !== 0) {
    const interaction = summary.statistics.interactionEffect;
    const sign = interaction > 0 ? 'positive' : 'negative';
    lines.push(
      '### Descriptive Interaction Effect',
      '',
      `The descriptive interaction effect is ${sign} (${(interaction * 100).toFixed(2)}%), suggesting that ` +
        (interaction > 0
          ? 'plan and learner model editability have synergistic effects when combined.'
          : 'the combination of plan and learner model may have diminishing returns.'),
      '',
    );
  }

  // Primary hypothesis result (Full vs Baseline t-test)
  const primaryComparison = summary.statistics.comparisons.find(
    (c) => c.name === 'Full vs Baseline',
  );
  if (primaryComparison) {
    const adjSig = primaryComparison.gapAdjustedP < 0.05;
    lines.push(
      '### Primary Hypothesis (H1): Full System vs Baseline (Gap-Only)',
      '',
      `Welch's t-test: t(${primaryComparison.gapTTest.df.toFixed(1)}) = ${primaryComparison.gapTTest.t.toFixed(3)}, ` +
        `p = ${primaryComparison.gapTTest.p.toFixed(4)}, p_adj = ${primaryComparison.gapAdjustedP.toFixed(4)}, ` +
        `d = ${primaryComparison.gapCohenD.toFixed(3)}, 95% CI [${(primaryComparison.gapTTest.ciLower * 100).toFixed(1)}, ${(primaryComparison.gapTTest.ciUpper * 100).toFixed(1)}]%`,
      '',
      adjSig
        ? `The full system (M = ${(primaryComparison.gapCondition1Mean * 100).toFixed(1)}%) significantly ` +
            `outperformed the baseline (M = ${(primaryComparison.gapCondition2Mean * 100).toFixed(1)}%) ` +
            `with a ${primaryComparison.gapInterpretation} effect size (Holm-Bonferroni corrected).`
        : `No significant difference was detected between the full system (M = ${(primaryComparison.gapCondition1Mean * 100).toFixed(1)}%) ` +
            `and baseline (M = ${(primaryComparison.gapCondition2Mean * 100).toFixed(1)}%) after Holm-Bonferroni correction.`,
      '',
    );
  }

  // Judge score analysis
  lines.push('### Judge Score Analysis', '');

  const notableJudgeComparisons = summary.statistics.comparisons.filter(
    (c) => c.judgeInterpretation === 'medium' || c.judgeInterpretation === 'large',
  );

  if (notableJudgeComparisons.length > 0) {
    lines.push('Notable judge score effect sizes:', '');
    for (const comp of notableJudgeComparisons) {
      const adjSig = comp.judgeAdjustedP < 0.05;
      lines.push(
        `- **${comp.name}**: d = ${comp.judgeCohenD.toFixed(3)} (${comp.judgeInterpretation}), ` +
          `p = ${comp.judgeTTest.p.toFixed(4)}, p_adj = ${comp.judgeAdjustedP.toFixed(4)}${adjSig ? ' *' : ''}`,
      );
    }
    lines.push('');
  } else {
    lines.push('No comparisons showed medium or large effect sizes on judge scores.', '');
  }

  if (summary.statistics.anovaJudge) {
    const aj = summary.statistics.anovaJudge;
    const judgeEffects: string[] = [];
    if (aj.planEffect.significant) {
      judgeEffects.push(
        `Plan editability shows a significant effect on judge scores (F = ${aj.planEffect.f.toFixed(2)}, p = ${aj.planEffect.p.toFixed(4)}).`,
      );
    }
    if (aj.modelEffect.significant) {
      judgeEffects.push(
        `Learner model editability shows a significant effect on judge scores (F = ${aj.modelEffect.f.toFixed(2)}, p = ${aj.modelEffect.p.toFixed(4)}).`,
      );
    }
    if (judgeEffects.length > 0) {
      lines.push('ANOVA on judge scores:', '', ...judgeEffects.map((e) => `- ${e}`), '');
    }
  }

  // Mechanism verification warnings
  lines.push('### Mechanism Verification', '');

  const warnings: string[] = [];
  const fullSystemStats = summary.statistics.byCondition['full_system'];
  const planOnlyStats = summary.statistics.byCondition['plan_only'];
  const modelOnlyStats = summary.statistics.byCondition['model_only'];
  const baselineStats = summary.statistics.byCondition['baseline'];

  // Warn if plan-editable conditions have zero plan edits
  if (fullSystemStats && fullSystemStats.mechanismMetrics.planEditsCount === 0) {
    warnings.push(
      '⚠️ **full_system** condition had zero plan edits. The plan editability manipulation may not have been exercised by the simulator.',
    );
  }
  if (planOnlyStats && planOnlyStats.mechanismMetrics.planEditsCount === 0) {
    warnings.push(
      '⚠️ **plan_only** condition had zero plan edits. The plan editability manipulation may not have been exercised by the simulator.',
    );
  }

  // Warn if non-editable conditions unexpectedly show edits
  if (modelOnlyStats && modelOnlyStats.mechanismMetrics.planEditsCount > 0) {
    warnings.push(
      `⚠️ **model_only** condition had ${modelOnlyStats.mechanismMetrics.planEditsCount} plan edits, but plan editability should be disabled!`,
    );
  }
  if (baselineStats && baselineStats.mechanismMetrics.planEditsCount > 0) {
    warnings.push(
      `⚠️ **baseline** condition had ${baselineStats.mechanismMetrics.planEditsCount} plan edits, but plan editability should be disabled!`,
    );
  }

  // Report evidence verification rate
  const allGapEvidence = summary.config.conditions.flatMap((c) => {
    const stats = summary.statistics.byCondition[c];
    return stats ? [stats.mechanismMetrics] : [];
  });
  const totalEvidence = allGapEvidence.reduce((sum, m) => sum + m.gapEvidenceTotal, 0);
  const verifiedEvidence = allGapEvidence.reduce((sum, m) => sum + m.gapEvidenceVerifiedCount, 0);
  const jsonParseFailures = allGapEvidence.reduce(
    (sum, m) => sum + m.gapEvidenceJsonParseFailedCount,
    0,
  );

  if (totalEvidence > 0) {
    const verifyRate = ((verifiedEvidence / totalEvidence) * 100).toFixed(1);
    lines.push(
      `- Evidence verification rate: ${verifiedEvidence}/${totalEvidence} (${verifyRate}%) of gap-topic post-test answers included verified transcript evidence.`,
      '',
    );

    if (jsonParseFailures > 0) {
      const jsonFailRate = ((jsonParseFailures / totalEvidence) * 100).toFixed(1);
      lines.push(
        `- JSON parse failure rate: ${jsonParseFailures}/${totalEvidence} (${jsonFailRate}%) of gap-topic post-test answers did not follow the required JSON format.`,
        '',
      );
    }
  }

  if (warnings.length > 0) {
    lines.push('**Warnings:**', '', ...warnings.map((w) => `- ${w}`), '');
  } else {
    lines.push('No mechanism verification issues detected.', '');
  }

  return lines.join('\n');
}

// ============================================================================
// Main
// ============================================================================

export async function runAblationCli(argv: string[]) {
  const args = parseArgs(argv);

  if (args.help) {
    usage();
    return;
  }

  if (args.list) {
    listAvailable();
    return;
  }

  await loadEnvDefaults();

  // Parse configuration
  const conditionArg = typeof args.conditions === 'string' ? args.conditions : '';
  let conditions: AblationCondition[] = [...ABLATION_CONDITIONS];
  if (conditionArg) {
    const requested = conditionArg
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    const invalid = requested.filter((c) => !ABLATION_CONDITIONS.includes(c as AblationCondition));
    if (invalid.length > 0) {
      console.error(`Error: Unknown condition(s): ${invalid.join(', ')}`);
      console.error(`Valid conditions: ${ABLATION_CONDITIONS.join(', ')}`);
      process.exit(1);
    }
    conditions = requested as AblationCondition[];
  }

  const scenarioArg = typeof args.scenarios === 'string' ? args.scenarios : '';
  let scenarios: AblationScenario[] = [...ABLATION_SCENARIOS];
  if (scenarioArg) {
    const requested = scenarioArg
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    const resolved = requested.map((id) => ({ id, scenario: getScenarioById(id) }));
    const invalid = resolved.filter((r) => !r.scenario).map((r) => r.id);
    if (invalid.length > 0) {
      console.error(`Error: Unknown scenario ID(s): ${invalid.join(', ')}`);
      console.error(`Valid scenarios: ${ABLATION_SCENARIOS.map((s) => s.id).join(', ')}`);
      process.exit(1);
    }
    scenarios = resolved.map((r) => r.scenario!).filter(Boolean);
  }

  if (conditions.length === 0) {
    console.error('Error: No valid conditions selected.');
    usage();
    process.exit(1);
  }

  if (scenarios.length === 0) {
    console.error('Error: No valid scenarios selected.');
    usage();
    process.exit(1);
  }

  assertValidScenarios(scenarios);

  const runsPerCell = typeof args.runs === 'string' ? parseInt(args.runs, 10) : 3;
  if (!Number.isFinite(runsPerCell) || runsPerCell <= 0) {
    console.error(`Error: Invalid --runs value: ${String(args.runs)} (expected positive integer).`);
    process.exit(1);
  }

  const requestedConcurrency =
    typeof args.concurrency === 'string' ? parseInt(args.concurrency, 10) : DEFAULT_CONCURRENCY;
  if (!Number.isFinite(requestedConcurrency) || requestedConcurrency <= 0) {
    console.error(
      `Error: Invalid --concurrency value: ${String(args.concurrency)} (expected positive integer).`,
    );
    process.exit(1);
  }
  const concurrency = Math.min(MAX_CONCURRENCY, Math.max(1, requestedConcurrency));
  const shuffleRuns = args['no-shuffle'] !== true;
  const tutorModel =
    typeof args['tutor-model'] === 'string' ? args['tutor-model'] : DEFAULT_ABLATION_TUTOR_MODEL_ID;
  const studentModel =
    typeof args['student-model'] === 'string'
      ? args['student-model']
      : 'google/gemini-2.5-flash-lite';
  const judgeModel =
    typeof args['judge-model'] === 'string' ? args['judge-model'] : 'anthropic/claude-haiku-4.5';
  const outputDir = typeof args.out === 'string' ? args.out : 'tmp/ablation';
  const resumeMode = args.resume === true;

  const currentConfig: AblationConfig = {
    conditions,
    scenarios: scenarios.map((s) => s.id),
    runsPerCell,
    tutorModel,
    studentModel,
    judgeModel,
  };

  const totalRuns = conditions.length * scenarios.length * runsPerCell;

  // Resume handling
  let checkpoint: AblationCheckpoint | null = null;
  let completedRunIds = new Set<string>();
  let results: AblationRunResult[] = [];
  let sessionId: string;
  let startTime: number;

  if (resumeMode) {
    checkpoint = await loadCheckpoint(outputDir);
    if (!checkpoint) {
      console.error(`Error: No checkpoint found in ${outputDir}`);
      console.error('Run without --resume to start a new study.');
      process.exit(1);
    }

    const validation = validateCheckpointConfig(checkpoint, currentConfig);
    if (!validation.valid) {
      console.error(`Error: Cannot resume - ${validation.reason}`);
      console.error('Run without --resume to start a new study with the current configuration.');
      process.exit(1);
    }

    sessionId = checkpoint.sessionId;
    startTime = checkpoint.startedAt;
    completedRunIds = new Set(checkpoint.completedRunIds);
    results = [...checkpoint.results];

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║       DIALOGIA ABLATION STUDY RUNNER (RESUMING)                ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log(`\nResuming session: ${sessionId}`);
    console.log(`Progress: ${completedRunIds.size}/${totalRuns} runs completed`);
    console.log(`Checkpoint from: ${new Date(checkpoint.lastSavedAt).toISOString()}`);
  } else {
    sessionId = uuidv4();
    startTime = Date.now();

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║           DIALOGIA ABLATION STUDY RUNNER                       ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
  }

  console.log(`\nConditions: ${conditions.join(', ')}`);
  console.log(`Scenarios:  ${scenarios.map((s) => s.id).join(', ')}`);
  console.log(`Runs/cell:  ${runsPerCell}`);
  console.log(`Total runs: ${totalRuns}`);
  console.log(`Concurrency: ${concurrency}`);
  console.log(`Shuffle:    ${shuffleRuns ? 'enabled' : 'disabled'}`);
  console.log(`Tutor:      ${tutorModel}`);
  console.log(`Student:    ${studentModel}`);
  console.log(`Judge:      ${judgeModel}`);
  console.log(`Output:     ${outputDir}`);
  console.log('Routing:    OpenRouter');

  if (args['dry-run']) {
    console.log('\n[DRY RUN] Would execute the above configuration.');
    return;
  }

  const apiKeys = {
    openrouter: getOpenRouterKeyFallback(),
  };

  if (!apiKeys.openrouter) {
    console.error('Error: OPENROUTER_API_KEY not found in environment');
    process.exit(1);
  }

  const reasoningSupport = await resolveReasoningSupportMap(
    [tutorModel, studentModel, judgeModel],
    apiKeys,
  );

  // Helper to create/update checkpoint with current state
  function buildCheckpoint(): AblationCheckpoint {
    return {
      version: 1,
      sessionId,
      startedAt: startTime,
      config: currentConfig,
      completedRunIds: Array.from(completedRunIds),
      results,
      lastSavedAt: Date.now(),
    };
  }

  checkpoint = buildCheckpoint();

  // Mutex for atomic checkpoint updates
  let checkpointLock = Promise.resolve();
  async function withCheckpointLock(fn: () => Promise<void>): Promise<void> {
    const prev = checkpointLock;
    checkpointLock = prev.then(fn).catch(() => {});
    await checkpointLock;
  }

  // Setup graceful shutdown handler
  let shuttingDown = false;
  async function handleShutdown(): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log('\n\nInterrupted! Saving checkpoint...');
    await withCheckpointLock(async () => {
      const nextCheckpoint = buildCheckpoint();
      checkpoint = nextCheckpoint;
      await saveCheckpoint(nextCheckpoint, outputDir);
    });
    console.log(`Checkpoint saved with ${completedRunIds.size}/${totalRuns} runs.`);
    console.log(`\nResume with: bun run ablation -- --resume --out ${outputDir}`);
    process.exit(130);
  }

  process.on('SIGINT', handleShutdown);
  process.on('SIGTERM', handleShutdown);

  let completedRuns = completedRunIds.size;

  // Build flat array of all run tasks
  const allTasks: RunTask[] = [];
  for (const condition of conditions) {
    for (const scenario of scenarios) {
      for (let runIndex = 0; runIndex < runsPerCell; runIndex++) {
        const runId = generateRunId(condition, scenario.id, runIndex);
        allTasks.push({ condition, scenario, runIndex, runId });
      }
    }
  }

  // Filter out completed runs
  const pendingTasks = allTasks.filter((task) => !completedRunIds.has(task.runId));

  // Shuffle to address run-order confound (using session seed for determinism when resuming)
  if (shuffleRuns) {
    const shuffleSeed = checkpoint?.sessionId ? hashString(checkpoint.sessionId) : Date.now();
    shuffleArray(pendingTasks, shuffleSeed);
    console.log(`\nRun order: shuffled (seed: ${shuffleSeed})`);
  } else {
    console.log('\nRun order: sequential (shuffle disabled)');
  }

  console.log(`Pending runs: ${pendingTasks.length}/${totalRuns}`);

  // Semaphore for concurrency control
  const semaphore = new Semaphore(concurrency);

  // Execute run with semaphore and retry logic
  const executeRun = async (task: RunTask): Promise<void> => {
    await semaphore.acquire();
    try {
      let success = false;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const result = await runSingleAblation(
            task.scenario,
            task.condition,
            task.runIndex,
            task.runId,
            {
              tutorModel,
              studentModel,
              judgeModel,
              apiKeys,
              reasoningSupport,
            },
          );

          // Atomic checkpoint update
          await withCheckpointLock(async () => {
            results.push(result);
            completedRunIds.add(task.runId);
            completedRuns++;
            checkpoint = buildCheckpoint();
            await saveCheckpoint(checkpoint, outputDir);
          });

          const elapsed = (Date.now() - startTime) / 1000;
          const avgPerRun = elapsed / completedRuns;
          const remaining = (totalRuns - completedRuns) * avgPerRun;
          console.log(
            `  Progress: ${completedRuns}/${totalRuns} (${((completedRuns / totalRuns) * 100).toFixed(1)}%) ` +
              `| Est. remaining: ${(remaining / 60).toFixed(1)} min`,
          );

          success = true;
          break;
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          if (attempt < MAX_RETRIES) {
            const delayMs = RETRY_DELAY_MS * attempt;
            console.warn(
              `  [RETRY ${attempt}/${MAX_RETRIES}] ${task.runId}: ${errMsg}. Waiting ${delayMs / 1000}s...`,
            );
            await sleep(delayMs);
          } else {
            console.error(`  [FAILED] ${task.runId} after ${MAX_RETRIES} attempts: ${errMsg}`);
            await withCheckpointLock(async () => {
              await saveCheckpoint(buildCheckpoint(), outputDir);
            });
          }
        }
      }

      if (!success) {
        console.error(`  Skipping ${task.runId} due to repeated failures.`);
      }
    } finally {
      semaphore.release();
    }
  };

  // Execute all pending tasks with concurrency control
  console.log(`\n--- Starting parallel execution (concurrency: ${concurrency}) ---`);
  await Promise.allSettled(pendingTasks.map(executeRun));

  process.removeListener('SIGINT', handleShutdown);
  process.removeListener('SIGTERM', handleShutdown);

  // Calculate statistics
  console.log('\n━━━ Calculating Statistics ━━━');
  const statistics = calculateStatistics(results, conditions);

  // Build summary
  const summary: AblationSummary = {
    startedAt: startTime,
    completedAt: Date.now(),
    totalRuns,
    completedRuns,
    config: {
      conditions,
      scenarios: scenarios.map((s) => s.id),
      runsPerCell,
      tutorModel,
    },
    results,
    statistics,
  };

  // Save results and delete checkpoint
  await saveResults(summary, outputDir);
  if (completedRuns === totalRuns) {
    await deleteCheckpoint(outputDir);
  } else {
    console.warn('\nWarning: Not all runs completed. Keeping checkpoint for resume.');
    console.warn(`Resume with: bun run ablation -- --resume --out ${outputDir}`);
  }

  // Print summary
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                      STUDY COMPLETE                            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`\nDuration: ${((Date.now() - startTime) / 60000).toFixed(1)} minutes`);
  console.log(`Completed: ${completedRuns}/${totalRuns} runs`);
  console.log(`\nResults saved to: ${outputDir}/`);

  // Quick results summary
  console.log('\n=== Quick Summary ===\n');
  for (const condition of conditions) {
    const stats = statistics.byCondition[condition];
    if (!stats) continue;
    console.log(
      `${condition.padEnd(15)} | ` +
        `GapNorm: ${(stats.gapNormalizedGain.mean * 100).toFixed(1).padStart(6)}% | ` +
        `Norm: ${(stats.normalizedGain.mean * 100).toFixed(1).padStart(6)}%`,
    );
  }
}
