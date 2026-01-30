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
import { createHeadlessRunner } from '@/lib/headless/runner';
import { LLMUserSimulator } from '@/lib/headless/simulators';
import { renderSnapshotTranscript } from '@/lib/headless/transcript';
import { createModelIndex, isReasoningSupported } from '@/lib/models';
import { resolveModelTransport } from '@/lib/providers';
import { DEFAULT_BASE_SYSTEM } from '@/lib/agent/policy';
import { getChatCompletion } from '@/lib/agent/pipelineClient';
import { buildJudgeMessages, type JudgeVerdict } from '@/lib/eval/judgePrompts';
import { getLatestLearnerModel, generateModelSummary } from '@/lib/agent/learnerModel';
import { summarizeLearningPlan } from '@/lib/learningPlan/service';
import { getOpenRouterKeyFallback } from '@/lib/env/server';
import { fetchModels } from '@/lib/openrouter';
import {
  ABLATION_CONDITIONS,
  CONDITION_CONFIGS,
  getConditionSettings,
  COMPARISON_PAIRS,
  calculateInteractionEffect,
  type AblationCondition,
} from '@/lib/eval/ablationConfig';
import {
  ABLATION_SCENARIOS,
  DEFAULT_ABLATION_TUTOR_MODEL_ID,
  getScenarioById,
  generatePlanFromScenario,
  type AblationScenario,
} from '@/lib/eval/ablationScenarios';
import {
  administerTest,
  calculateLearningGain,
  calculateCohenD,
  calculateStats,
  welchTTest,
  twoWayAnova,
  type TestResult,
  type TTestResult,
  type AnovaResult,
} from '@/lib/eval/prePostTest';
import type { Chat, ModelDescriptor, ModelTransport, LearnerModel } from '@/lib/types';
import type { HeadlessTurnSnapshot } from '@/lib/headless/types';
import { parseArgs } from '@/lib/cli/args';
import { loadEnvDefaults } from '@/lib/cli/env.node';
import { buildTransportAuth, type TransportAuth } from '@/lib/auth/transport';

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
        learningGain: { mean: number; sd: number; n: number };
        normalizedGain: { mean: number; sd: number; n: number };
        turnsUsed: { mean: number; sd: number; n: number };
        judgeScore: { mean: number; sd: number; n: number };
      }
    >;
    comparisons: Array<{
      name: string;
      hypothesis: string;
      cohenD: number;
      interpretation: string;
      condition1Mean: number;
      condition2Mean: number;
      tTest: { t: number; df: number; p: number; significant: boolean };
    }>;
    interactionEffect: number;
    anova?: AnovaResult;
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
    return checkpoint;
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
// Model Setup
// ============================================================================

const normalizeModelId = (id: string): string => id.trim().toLowerCase();

async function resolveReasoningSupportMap(
  modelIds: string[],
  apiKeys: { openrouter?: string },
): Promise<Record<string, boolean>> {
  const support: Record<string, boolean> = {};
  if (!apiKeys.openrouter) return support;

  const uniqueIds = Array.from(
    new Set(modelIds.map((id) => normalizeModelId(id)).filter(Boolean)),
  );
  if (!uniqueIds.length) return support;

  try {
    const auth = buildTransportAuth({
      transport: 'openrouter',
      apiKey: apiKeys.openrouter,
      useProxy: false,
    });
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
  const preTest = await administerTest(scenario.preTestQuestions, 'pre', {
    auth: resolveAuth({ modelId: config.studentModel, transport: studentTransport }),
    model: config.studentModel,
    studentPersona: scenario.studentPersona,
    priorKnowledge: `Level: ${scenario.level}. Topic: ${scenario.topic}`,
    testType: 'pre',
    knowledgeGaps: scenario.knowledgeGaps, // Student has gaps before tutoring
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

  // Setup student simulator with condition-aware editability instructions
  const conditionConfig = CONDITION_CONFIGS[condition];
  const visibilityInstructions: string[] = [];
  const editabilityInstructions: string[] = [];

  if (conditionConfig.planVisible && !conditionConfig.planEditable) {
    visibilityInstructions.push(
      'You can view the learning plan, but you cannot edit its structure or ordering.',
    );
  }
  if (conditionConfig.learnerModelVisible && !conditionConfig.learnerModelEditable) {
    visibilityInstructions.push(
      'You can view your mastery estimates, but you cannot directly edit them.',
    );
  }

  if (conditionConfig.planEditable) {
    editabilityInstructions.push(
      'You can ask the tutor to modify the learning plan if you want to skip topics you already know, ' +
        'add topics you want to learn, or change the order of topics.',
    );
  }
  if (conditionConfig.learnerModelEditable) {
    editabilityInstructions.push(
      'If you feel the tutor has misjudged your understanding (too high or too low), ' +
        'you can tell them directly and ask them to adjust their assessment of your mastery.',
    );
  }

  const studentSim = new LLMUserSimulator({
    modelId: config.studentModel,
    auth: resolveAuth({ modelId: config.studentModel, transport: studentTransport }),
    personaPrompt: [
      'You are a student in a tutoring session.',
      `Topic: ${scenario.topic} (${scenario.level})`,
      `Goal: ${scenario.goal}`,
      `Persona: ${scenario.studentPersona}`,
      `Your pre-test score was ${preTest.score.toFixed(0)}%.`,
      'Respond naturally, ask questions when confused, and occasionally make mistakes fitting your persona.',
      scenario.constraints?.length ? `Constraints: ${scenario.constraints.join('; ')}` : '',
      visibilityInstructions.length > 0 ? '' : null,
      ...visibilityInstructions,
      editabilityInstructions.length > 0 ? '' : null,
      editabilityInstructions.length > 0
        ? 'IMPORTANT - You have control over the tutoring process:'
        : null,
      ...editabilityInstructions,
      editabilityInstructions.length > 0
        ? 'Use these abilities naturally when appropriate (e.g., if you already know a topic, or if the tutor seems to misunderstand your level).'
        : null,
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
      learnerModelSummary,
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
  });
  console.log(`  [${runId}] Post-test score: ${postTest.score.toFixed(1)}%`);

  // Calculate learning gain
  const learningGain = postTest.score - preTest.score;
  const normalizedGain = calculateLearningGain(preTest.score, postTest.score);

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
  try {
    // Try to extract JSON from the response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as JudgeVerdict;
    }
  } catch {
    // Parsing failed
  }
  return undefined;
}

/**
 * Extract edit events from session snapshots.
 * Tracks when plan modifications or mastery overrides occur.
 */
function extractEditEvents(
  snapshots: HeadlessTurnSnapshot[],
  options?: { planEditable?: boolean },
): EditEvent[] {
  const events: EditEvent[] = [];
  const planEventsAllowed = options?.planEditable !== false;
  let initialPlanGenerated = false;

  const looksLikePlanEditRequest = (text: string | undefined): boolean => {
    if (!text) return false;
    return /\b(skip|remove|add|insert|reorder|change order|move|drop|swap|edit plan|update plan)\b/i.test(
      text,
    );
  };

  const looksLikeModelOverrideRequest = (text: string | undefined): boolean => {
    if (!text) return false;
    return /\b(too high|too low|overestimating|underestimating|I already know|I know this|I don't know|my mastery|my confidence|adjust|update)\b/i.test(
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
      const isGeneratePlan = tc.name === 'generate_plan';
      const isFirstPlanGeneration = isGeneratePlan && !initialPlanGenerated;
      if (isGeneratePlan) initialPlanGenerated = true;
      const succeeded = (tc.status ?? 'success') === 'success';

      // Skip failed tool calls
      if (!succeeded) continue;

      // Plan modification tools
      if (planEventsAllowed && (tc.name === 'update_plan' || isGeneratePlan)) {
        // Tutor auto-generates the initial plan; ignore that so we only count learner-driven edits.
        if (isFirstPlanGeneration) continue;
        if (!userRequestedPlanChange) continue;

        const plan = input.plan as Record<string, unknown> | undefined;
        events.push({
          turn: i + 1,
          type: 'plan_modification',
          toolName: tc.name,
          details: (input.reason as string) || (plan?.goal as string) || undefined,
        });
      }

      // Mastery override tool
      if (tc.name === 'apply_learner_model_feedback') {
        if (!userRequestedModelOverride) continue;
        const direction = input.direction as string | undefined;
        events.push({
          turn: i + 1,
          type: 'mastery_override',
          toolName: tc.name,
          nodeId: input.nodeId as string | undefined,
          details: (input.reason as string) || (direction ? `${direction} adjustment` : undefined),
        });
      }

      // Also track update_learner_model if it includes student-initiated feedback
      if (tc.name === 'update_learner_model') {
        const notes = input.notes as string | undefined;
        // Only count if there's explicit feedback/notes suggesting student input
        if (
          (notes && /student (said|reported|indicated|claimed|believes)/i.test(notes)) ||
          userRequestedModelOverride
        ) {
          events.push({
            turn: i + 1,
            type: 'mastery_override',
            toolName: tc.name,
            nodeId: input.nodeId as string | undefined,
            details: notes,
          });
        }
      }
    }
  }

  return events;
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
    const turns = conditionResults.map((r) => r.turnsUsed);
    const judgeScores = conditionResults
      .filter((r) => r.judgeVerdict?.overall_score != null)
      .map((r) => r.judgeVerdict!.overall_score);

    byCondition[condition] = {
      learningGain: calculateStats(gains),
      normalizedGain: calculateStats(normalizedGains),
      turnsUsed: calculateStats(turns),
      judgeScore: calculateStats(judgeScores),
    };
  }

  // Calculate comparisons with t-tests
  const comparisons = COMPARISON_PAIRS.filter(
    (p) => conditions.includes(p.conditions[0]) && conditions.includes(p.conditions[1]),
  ).map((pair) => {
    const gains1 = results
      .filter((r) => r.condition === pair.conditions[0])
      .map((r) => r.normalizedGain);
    const gains2 = results
      .filter((r) => r.condition === pair.conditions[1])
      .map((r) => r.normalizedGain);
    const { d, interpretation } = calculateCohenD(gains1, gains2);
    const tTest = welchTTest(gains1, gains2);
    return {
      name: pair.name,
      hypothesis: pair.hypothesis,
      cohenD: d,
      interpretation,
      condition1Mean: gains1.length > 0 ? gains1.reduce((a, b) => a + b, 0) / gains1.length : 0,
      condition2Mean: gains2.length > 0 ? gains2.reduce((a, b) => a + b, 0) / gains2.length : 0,
      tTest: {
        t: tTest.t,
        df: tTest.df,
        p: tTest.p,
        significant: tTest.significant,
      },
    };
  });

  // Calculate interaction effect and ANOVA when all 4 conditions are present
  let interactionEffect = 0;
  let anova: AnovaResult | undefined;

  const hasAllConditions =
    conditions.includes('full_system') &&
    conditions.includes('plan_only') &&
    conditions.includes('model_only') &&
    conditions.includes('baseline');

  if (hasAllConditions) {
    interactionEffect = calculateInteractionEffect({
      full_system: byCondition.full_system?.normalizedGain.mean ?? 0,
      plan_only: byCondition.plan_only?.normalizedGain.mean ?? 0,
      model_only: byCondition.model_only?.normalizedGain.mean ?? 0,
      baseline: byCondition.baseline?.normalizedGain.mean ?? 0,
    });

    // Run 2-way ANOVA
    anova = twoWayAnova({
      fullSystem: results.filter((r) => r.condition === 'full_system').map((r) => r.normalizedGain),
      planOnly: results.filter((r) => r.condition === 'plan_only').map((r) => r.normalizedGain),
      modelOnly: results.filter((r) => r.condition === 'model_only').map((r) => r.normalizedGain),
      baseline: results.filter((r) => r.condition === 'baseline').map((r) => r.normalizedGain),
    });
  }

  return { byCondition, comparisons, interactionEffect, anova };
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

function generateMarkdownTables(summary: AblationSummary): string {
  const lines: string[] = [
    '# Ablation Study Results',
    '',
    `Generated: ${new Date(summary.completedAt).toISOString()}`,
    `Total runs: ${summary.completedRuns}/${summary.totalRuns}`,
    '',
    '## Learning Gains by Condition',
    '',
    '| Condition | Learning Gain | Normalized Gain | Turns Used | Judge Score |',
    '|-----------|--------------|-----------------|------------|-------------|',
  ];

  for (const condition of summary.config.conditions) {
    const stats = summary.statistics.byCondition[condition];
    if (!stats) continue;
    lines.push(
      `| ${condition} | ${stats.learningGain.mean.toFixed(1)} ± ${stats.learningGain.sd.toFixed(1)} | ` +
        `${(stats.normalizedGain.mean * 100).toFixed(1)}% ± ${(stats.normalizedGain.sd * 100).toFixed(1)}% | ` +
        `${stats.turnsUsed.mean.toFixed(1)} ± ${stats.turnsUsed.sd.toFixed(1)} | ` +
        `${stats.judgeScore.mean.toFixed(2)} ± ${stats.judgeScore.sd.toFixed(2)} |`,
    );
  }

  lines.push(
    '',
    "## Pairwise Comparisons (Welch's t-test)",
    '',
    "| Comparison | Cohen's d | Interp. | t | df | p-value | Sig. | C1 Mean | C2 Mean |",
    '|------------|-----------|---------|---|----|---------|----- |---------|---------|',
  );

  for (const comp of summary.statistics.comparisons) {
    const sig = comp.tTest.significant ? '*' : '';
    lines.push(
      `| ${comp.name} | ${comp.cohenD.toFixed(3)} | ${comp.interpretation} | ` +
        `${comp.tTest.t.toFixed(3)} | ${comp.tTest.df.toFixed(1)} | ${comp.tTest.p.toFixed(4)} | ${sig} | ` +
        `${(comp.condition1Mean * 100).toFixed(1)}% | ${(comp.condition2Mean * 100).toFixed(1)}% |`,
    );
  }

  if (summary.statistics.anova) {
    const anova = summary.statistics.anova;
    lines.push(
      '',
      '## 2-Way ANOVA (Plan × Model)',
      '',
      '| Source | F | p-value | Sig. |',
      '|--------|---|---------|------|',
      `| Plan (main effect) | ${anova.planEffect.f.toFixed(3)} | ${anova.planEffect.p.toFixed(4)} | ${anova.planEffect.significant ? '*' : ''} |`,
      `| Model (main effect) | ${anova.modelEffect.f.toFixed(3)} | ${anova.modelEffect.p.toFixed(4)} | ${anova.modelEffect.significant ? '*' : ''} |`,
      `| Plan × Model (interaction) | ${anova.interaction.f.toFixed(3)} | ${anova.interaction.p.toFixed(4)} | ${anova.interaction.significant ? '*' : ''} |`,
      '',
      `Residual MS: ${anova.residualMS.toFixed(6)}`,
      '',
      '> \\* p < 0.05',
    );
  }

  if (summary.statistics.interactionEffect !== 0) {
    lines.push(
      '',
      '## Interaction Effect (Descriptive)',
      '',
      `Plan × Model Interaction: ${(summary.statistics.interactionEffect * 100).toFixed(2)}%`,
      '',
      '> Positive value indicates synergy between plan and learner model editability.',
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
  const significantComparisons = summary.statistics.comparisons.filter(
    (c) => c.interpretation === 'medium' || c.interpretation === 'large',
  );

  if (significantComparisons.length > 0) {
    lines.push('### Notable Effect Sizes:', '');
    for (const comp of significantComparisons) {
      lines.push(
        `- **${comp.name}**: d = ${comp.cohenD.toFixed(3)} (${comp.interpretation})`,
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
        `Plan editability shows a significant main effect (F = ${anova.planEffect.f.toFixed(2)}, p = ${anova.planEffect.p.toFixed(4)}), ` +
          'indicating that curriculum editability affects learning outcomes independent of learner model editability.',
      );
    }
    if (anova.modelEffect.significant) {
      effects.push(
        `Learner model editability shows a significant main effect (F = ${anova.modelEffect.f.toFixed(2)}, p = ${anova.modelEffect.p.toFixed(4)}), ` +
          'indicating that mastery editability affects learning outcomes independent of plan editability.',
      );
    }
    if (anova.interaction.significant) {
      effects.push(
        `The interaction is significant (F = ${anova.interaction.f.toFixed(2)}, p = ${anova.interaction.p.toFixed(4)}), ` +
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
    lines.push(
      '### Primary Hypothesis (H1): Full System vs Baseline',
      '',
      `Welch's t-test: t(${primaryComparison.tTest.df.toFixed(1)}) = ${primaryComparison.tTest.t.toFixed(3)}, ` +
        `p = ${primaryComparison.tTest.p.toFixed(4)}, d = ${primaryComparison.cohenD.toFixed(3)}`,
      '',
      primaryComparison.tTest.significant
        ? `The full system (M = ${(primaryComparison.condition1Mean * 100).toFixed(1)}%) significantly ` +
            `outperformed the baseline (M = ${(primaryComparison.condition2Mean * 100).toFixed(1)}%) ` +
            `with a ${primaryComparison.interpretation} effect size.`
        : `No significant difference was detected between the full system (M = ${(primaryComparison.condition1Mean * 100).toFixed(1)}%) ` +
            `and baseline (M = ${(primaryComparison.condition2Mean * 100).toFixed(1)}%).`,
      '',
    );
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
  const conditions: AblationCondition[] = conditionArg
    ? (conditionArg
        .split(',')
        .filter((c) => ABLATION_CONDITIONS.includes(c as AblationCondition)) as AblationCondition[])
    : [...ABLATION_CONDITIONS];

  const scenarioArg = typeof args.scenarios === 'string' ? args.scenarios : '';
  const scenarios = scenarioArg
    ? (scenarioArg
        .split(',')
        .map((id) => getScenarioById(id))
        .filter(Boolean) as AblationScenario[])
    : [...ABLATION_SCENARIOS];

  const runsPerCell = typeof args.runs === 'string' ? parseInt(args.runs, 10) : 3;
  const tutorModel =
    typeof args['tutor-model'] === 'string'
      ? args['tutor-model']
      : DEFAULT_ABLATION_TUTOR_MODEL_ID;
  const studentModel =
    typeof args['student-model'] === 'string'
      ? args['student-model']
      : 'google/gemini-2.5-flash-lite';
  const judgeModel =
    typeof args['judge-model'] === 'string' ? args['judge-model'] : 'anthropic/claude-haiku-4.5';
  const outputDir = typeof args.out === 'string' ? args.out : 'tmp/ablation';
  const resumeMode = args.resume === true;

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
  console.log(`Tutor:      ${tutorModel}`);
  console.log(`Student:    ${studentModel}`);
  console.log(`Judge:      ${judgeModel}`);
  console.log(`Output:     ${outputDir}`);
  console.log('Routing:    OpenRouter');

  if (args['dry-run']) {
    console.log('\n[DRY RUN] Would execute the above configuration.');
    return;
  }

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

  // Setup graceful shutdown handler
  let shuttingDown = false;
  async function handleShutdown(): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log('\n\nInterrupted! Saving checkpoint...');
    checkpoint = buildCheckpoint();
    await saveCheckpoint(checkpoint, outputDir);
    console.log(`Checkpoint saved with ${checkpoint.completedRunIds.length}/${totalRuns} runs.`);
    console.log(`\nResume with: bun run ablation -- --resume --out ${outputDir}`);
    process.exit(130);
  }

  process.on('SIGINT', handleShutdown);
  process.on('SIGTERM', handleShutdown);

  let completedRuns = completedRunIds.size;

  for (const condition of conditions) {
    console.log(`\n--- Condition: ${condition} (${CONDITION_CONFIGS[condition].name}) ---`);

    for (const scenario of scenarios) {
      console.log(`\n> Scenario: ${scenario.id} (${scenario.title})`);

      for (let run = 0; run < runsPerCell; run++) {
        const runId = generateRunId(condition, scenario.id, run);

        if (completedRunIds.has(runId)) {
          console.log(`  [${runId}] Skipped (already completed)`);
          continue;
        }

        let success = false;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          try {
            const result = await runSingleAblation(scenario, condition, run, runId, {
              tutorModel,
              studentModel,
              judgeModel,
              apiKeys,
              reasoningSupport,
            });

            results.push(result);
            completedRunIds.add(runId);
            completedRuns++;

            checkpoint = buildCheckpoint();
            await saveCheckpoint(checkpoint, outputDir);

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
                `  [RETRY ${attempt}/${MAX_RETRIES}] ${runId}: ${errMsg}. Waiting ${delayMs / 1000}s...`,
              );
              await sleep(delayMs);
            } else {
              console.error(`  [FAILED] ${runId} after ${MAX_RETRIES} attempts: ${errMsg}`);
              await saveCheckpoint(buildCheckpoint(), outputDir);
            }
          }
        }

        if (!success) {
          console.error(`  Skipping ${runId} due to repeated failures.`);
        }
      }
    }
  }

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
        `Gain: ${stats.learningGain.mean.toFixed(1).padStart(6)}% | ` +
        `Normalized: ${(stats.normalizedGain.mean * 100).toFixed(1).padStart(6)}%`,
    );
  }
}
