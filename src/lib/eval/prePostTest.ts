import type { TestQuestion, KnowledgeGap } from '@/lib/eval/ablationScenarios';
import type { TransportAuth } from '@/lib/auth/transport';
import { getChatCompletion } from '@/lib/agent/pipelineClient';

export type TestResult = {
  testType: 'pre' | 'post';
  questions: TestQuestion[];
  answers: number[]; // Index selected for each question
  correct: boolean[];
  score: number; // 0-100
  rawScore: number; // Count of correct
  byTopic: Record<string, { correct: number; total: number }>;
  administeredAt: number;
};

export type TestAdminOptions = {
  auth: TransportAuth;
  model: string;
  studentPersona?: string;
  priorKnowledge?: string; // Description of what the student knows
  testType: 'pre' | 'post'; // Whether this is pre or post test
  knowledgeGaps?: KnowledgeGap[]; // Topics the student doesn't know
  sessionTranscript?: string; // NEW: The actual tutoring session content
};

/**
 * Administer a test to a simulated student.
 * The LLM plays the role of the student answering MCQ questions.
 */
export async function administerTest(
  questions: TestQuestion[],
  testType: 'pre' | 'post',
  options: TestAdminOptions,
): Promise<TestResult> {
  const answers: number[] = [];
  const correct: boolean[] = [];
  const byTopic: Record<string, { correct: number; total: number }> = {};

  for (const question of questions) {
    const answer = await askQuestion(question, options);
    answers.push(answer);
    const isCorrect = answer === question.correctIndex;
    correct.push(isCorrect);

    // Track by topic
    if (!byTopic[question.topicId]) {
      byTopic[question.topicId] = { correct: 0, total: 0 };
    }
    byTopic[question.topicId].total += 1;
    if (isCorrect) {
      byTopic[question.topicId].correct += 1;
    }
  }

  const rawScore = correct.filter(Boolean).length;
  const score = (rawScore / questions.length) * 100;

  return {
    testType,
    questions,
    answers,
    correct,
    score,
    rawScore,
    byTopic,
    administeredAt: Date.now(),
  };
}

/**
 * Ask a single MCQ question to the simulated student.
 */
async function askQuestion(question: TestQuestion, options: TestAdminOptions): Promise<number> {
  const optionsText = question.options.map((opt, i) => `${i}. ${opt}`).join('\n');

  const prompt = buildStudentPrompt(question, optionsText, options);

  const response = await getChatCompletion()({
    auth: options.auth,
    model: options.model,
    messages: [{ role: 'user', content: prompt }],
    temperature: options.testType === 'post' ? 0.1 : 0.3, // Lower temp for post-test reasoning
    maxTokens: 10,
  });

  const text = extractText(response);
  return parseAnswer(text, question.options.length);
}

function buildStudentPrompt(
  question: TestQuestion,
  optionsText: string,
  options: TestAdminOptions,
): string {
  const gap = options.knowledgeGaps?.find((g) => g.topicId === question.topicId);

  // Pre-Test Logic:
  // If there is a gap, force incorrect answer based on errorRate
  const isPreTest = options.testType === 'pre';
  const shouldForceIncorrect = isPreTest && !!gap && Math.random() < (gap.errorRate ?? 0.8);

  // Post-Test Logic:
  // If there is a transcript, the student must prove the transcript taught them.
  // Otherwise, they fall back to the misconception.
  const isPostTest = options.testType === 'post';
  const hasTranscript = !!options.sessionTranscript;

  let contextInstruction = '';

  if (isPreTest) {
    if (gap) {
      if (shouldForceIncorrect) {
        contextInstruction = `
CRITICAL INSTRUCTION: You do NOT understand the topic "${question.topicId}" well.
Your specific misconception: "${gap.misconception}".
You MUST answer this question INCORRECTLY based on this misconception. 
Do NOT pick the correct answer. Pick a plausible wrong answer.
`;
      } else {
        contextInstruction = `
You are unsure about the topic "${question.topicId}".
Misconception: "${gap.misconception}".
Try to answer to the best of your knowledge, but you are prone to mistakes on this topic.
`;
      }
    } else {
      contextInstruction = `
You are taking a pre-test to measure what you already know about "${question.topicId}".
Answer honestly based on your current knowledge. If you are unsure, make your best guess.
`;
    }
  } else if (isPostTest) {
    if (hasTranscript) {
      if (gap) {
        contextInstruction = `
INSTRUCTION: You have just finished a tutoring session.
Read the transcript below carefully.
- If the tutor effectively explained "${question.topicId}" or corrected your misconception ("${gap.misconception}"), answer CORRECTLY.
- If the topic was NOT discussed or the explanation was unclear, you MUST stick to your original misconception: "${gap.misconception}" and answer INCORRECTLY.
- Do not assume you learned it if it wasn't mentioned.

--- SESSION TRANSCRIPT ---
${options.sessionTranscript}
-------------------------
`;
      } else {
        contextInstruction = `
INSTRUCTION: You have just finished a tutoring session.
Read the transcript below carefully.
- Answer based on what was actually covered about "${question.topicId}".
- If the topic was NOT discussed or the explanation was unclear, rely on your existing understanding and make your best guess.
- Do not assume you learned it if it wasn't mentioned.

--- SESSION TRANSCRIPT ---
${options.sessionTranscript}
-------------------------
`;
      }
    } else {
      // Fallback if no transcript provided (legacy behavior)
      contextInstruction =
        'You just completed tutoring on this topic. Answer to the best of your improved knowledge.';
    }
  }

  const parts = [
    'You are a student taking a test.',
    options.studentPersona ? `Student persona: ${options.studentPersona}` : null,
    options.priorKnowledge ? `Prior knowledge: ${options.priorKnowledge}` : null,
    '',
    contextInstruction,
    '',
    'Answer the following multiple choice question by responding with ONLY the number (0, 1, 2, or 3) of your chosen answer.',
    'Do not explain your reasoning, just output the number.',
    '',
    `Question: ${question.question}`,
    '',
    optionsText,
    '',
    'Your answer (just the number):',
  ];

  return parts.filter((p) => p !== null).join('\n');
}

function extractText(response: unknown): string {
  if (!response || typeof response !== 'object') return '';
  const resp = response as { choices?: Array<{ message?: { content?: unknown } }> };
  const content = resp.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((c) => (typeof c === 'string' ? c : (c?.text ?? '')))
      .join('')
      .trim();
  }
  return '';
}

function parseAnswer(text: string, numOptions: number): number {
  // Try to extract a number from the response
  const match = text.match(/\b([0-3])\b/);
  if (match) {
    const num = parseInt(match[1], 10);
    if (num >= 0 && num < numOptions) {
      return num;
    }
  }
  // Fallback: random answer (simulates confused student)
  return Math.floor(Math.random() * numOptions);
}

/**
 * Calculate normalized learning gain.
 * Gain = (post - pre) / (100 - pre)
 * Returns 0 if pre is already 100.
 */
export function calculateLearningGain(preScore: number, postScore: number): number {
  if (preScore >= 100) return 0;
  return (postScore - preScore) / (100 - preScore);
}

/**
 * Calculate effect size (Cohen's d) between two groups.
 */
export function calculateCohenD(
  group1: number[],
  group2: number[],
): { d: number; interpretation: string } {
  // Need at least two samples per group to compute a stable pooled SD
  if (group1.length < 2 || group2.length < 2) {
    return { d: 0, interpretation: 'insufficient-data' };
  }

  const mean1 = group1.reduce((a, b) => a + b, 0) / group1.length;
  const mean2 = group2.reduce((a, b) => a + b, 0) / group2.length;

  const var1 = group1.reduce((sum, x) => sum + (x - mean1) ** 2, 0) / (group1.length - 1);
  const var2 = group2.reduce((sum, x) => sum + (x - mean2) ** 2, 0) / (group2.length - 1);

  // Pooled standard deviation
  const pooledSD = Math.sqrt(
    ((group1.length - 1) * var1 + (group2.length - 1) * var2) / (group1.length + group2.length - 2),
  );

  if (!Number.isFinite(pooledSD) || pooledSD <= 0) {
    return { d: 0, interpretation: 'insufficient-data' };
  }

  const d = (mean1 - mean2) / pooledSD;

  let interpretation: string;
  const absD = Math.abs(d);
  if (absD < 0.2) interpretation = 'negligible';
  else if (absD < 0.5) interpretation = 'small';
  else if (absD < 0.8) interpretation = 'medium';
  else interpretation = 'large';

  return { d, interpretation };
}

// ============================================================================
// Statistical Inference Functions
// ============================================================================

export type TTestResult = {
  t: number;
  df: number;
  p: number;
  significant: boolean;
  mean1: number;
  mean2: number;
  se: number;
};

/**
 * Perform Welch's t-test for independent samples with unequal variances.
 * Returns t-statistic, degrees of freedom, and two-tailed p-value.
 */
export function welchTTest(group1: number[], group2: number[]): TTestResult {
  if (group1.length < 2 || group2.length < 2) {
    return { t: 0, df: 0, p: 1, significant: false, mean1: 0, mean2: 0, se: 0 };
  }

  const n1 = group1.length;
  const n2 = group2.length;
  const mean1 = group1.reduce((a, b) => a + b, 0) / n1;
  const mean2 = group2.reduce((a, b) => a + b, 0) / n2;

  const var1 = group1.reduce((sum, x) => sum + (x - mean1) ** 2, 0) / (n1 - 1);
  const var2 = group2.reduce((sum, x) => sum + (x - mean2) ** 2, 0) / (n2 - 1);

  const se = Math.sqrt(var1 / n1 + var2 / n2);
  if (se === 0) {
    let t = 0;
    let p = 1;
    if (mean1 !== mean2) {
      t = mean1 > mean2 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
      p = 0;
    }
    return { t, df: n1 + n2 - 2, p, significant: p < 0.05, mean1, mean2, se: 0 };
  }

  const t = (mean1 - mean2) / se;

  // Welch-Satterthwaite degrees of freedom approximation
  const num = (var1 / n1 + var2 / n2) ** 2;
  const denom = (var1 / n1) ** 2 / (n1 - 1) + (var2 / n2) ** 2 / (n2 - 1);
  const df = denom > 0 ? num / denom : n1 + n2 - 2;

  // Calculate p-value using t-distribution CDF
  const p = 2 * (1 - tDistCDF(Math.abs(t), df));

  return {
    t,
    df,
    p,
    significant: p < 0.05,
    mean1,
    mean2,
    se,
  };
}

export type AnovaResult = {
  planEffect: { f: number; p: number; significant: boolean };
  modelEffect: { f: number; p: number; significant: boolean };
  interaction: { f: number; p: number; significant: boolean };
  residualMS: number;
  grandMean: number;
};

export type AnovaGroups = {
  fullSystem: number[];
  planOnly: number[];
  modelOnly: number[];
  baseline: number[];
};

/**
 * Perform 2-way ANOVA for 2x2 factorial design.
 * Factors: Plan (editable vs read-only) and Model (editable vs hidden).
 */
export function twoWayAnova(groups: AnovaGroups): AnovaResult {
  const { fullSystem, planOnly, modelOnly, baseline } = groups;
  const allData = [...fullSystem, ...planOnly, ...modelOnly, ...baseline];
  const N = allData.length;

  if (
    N < 8 ||
    fullSystem.length < 2 ||
    planOnly.length < 2 ||
    modelOnly.length < 2 ||
    baseline.length < 2
  ) {
    return {
      planEffect: { f: 0, p: 1, significant: false },
      modelEffect: { f: 0, p: 1, significant: false },
      interaction: { f: 0, p: 1, significant: false },
      residualMS: 0,
      grandMean: 0,
    };
  }

  const grandMean = allData.reduce((a, b) => a + b, 0) / N;

  // Cell means
  const meanFS = fullSystem.reduce((a, b) => a + b, 0) / fullSystem.length;
  const meanPO = planOnly.reduce((a, b) => a + b, 0) / planOnly.length;
  const meanMO = modelOnly.reduce((a, b) => a + b, 0) / modelOnly.length;
  const meanBL = baseline.reduce((a, b) => a + b, 0) / baseline.length;

  // Marginal means
  // Plan editable: fullSystem + planOnly; Plan read-only: modelOnly + baseline
  const nPlanVis = fullSystem.length + planOnly.length;
  const nPlanHid = modelOnly.length + baseline.length;
  const meanPlanVis =
    (fullSystem.reduce((a, b) => a + b, 0) + planOnly.reduce((a, b) => a + b, 0)) / nPlanVis;
  const meanPlanHid =
    (modelOnly.reduce((a, b) => a + b, 0) + baseline.reduce((a, b) => a + b, 0)) / nPlanHid;

  // Model editable: fullSystem + modelOnly; Model hidden: planOnly + baseline
  const nModelVis = fullSystem.length + modelOnly.length;
  const nModelHid = planOnly.length + baseline.length;
  const meanModelVis =
    (fullSystem.reduce((a, b) => a + b, 0) + modelOnly.reduce((a, b) => a + b, 0)) / nModelVis;
  const meanModelHid =
    (planOnly.reduce((a, b) => a + b, 0) + baseline.reduce((a, b) => a + b, 0)) / nModelHid;

  // Sum of squares
  // SS Total
  const ssTotal = allData.reduce((sum, x) => sum + (x - grandMean) ** 2, 0);

  // SS for Plan factor (main effect)
  const ssPlan =
    nPlanVis * (meanPlanVis - grandMean) ** 2 + nPlanHid * (meanPlanHid - grandMean) ** 2;

  // SS for Model factor (main effect)
  const ssModel =
    nModelVis * (meanModelVis - grandMean) ** 2 + nModelHid * (meanModelHid - grandMean) ** 2;

  // SS for interaction
  // Expected cell mean under additivity = grandMean + (planEffect) + (modelEffect)
  const planEffectFS = meanPlanVis - grandMean;
  const modelEffectFS = meanModelVis - grandMean;
  const expectedFS = grandMean + planEffectFS + modelEffectFS;
  const interFS = meanFS - expectedFS;

  const planEffectPO = meanPlanVis - grandMean;
  const modelEffectPO = meanModelHid - grandMean;
  const expectedPO = grandMean + planEffectPO + modelEffectPO;
  const interPO = meanPO - expectedPO;

  const planEffectMO = meanPlanHid - grandMean;
  const modelEffectMO = meanModelVis - grandMean;
  const expectedMO = grandMean + planEffectMO + modelEffectMO;
  const interMO = meanMO - expectedMO;

  const planEffectBL = meanPlanHid - grandMean;
  const modelEffectBL = meanModelHid - grandMean;
  const expectedBL = grandMean + planEffectBL + modelEffectBL;
  const interBL = meanBL - expectedBL;

  const ssInteraction =
    fullSystem.length * interFS ** 2 +
    planOnly.length * interPO ** 2 +
    modelOnly.length * interMO ** 2 +
    baseline.length * interBL ** 2;

  // SS Residual (within groups)
  const ssResidual =
    fullSystem.reduce((sum, x) => sum + (x - meanFS) ** 2, 0) +
    planOnly.reduce((sum, x) => sum + (x - meanPO) ** 2, 0) +
    modelOnly.reduce((sum, x) => sum + (x - meanMO) ** 2, 0) +
    baseline.reduce((sum, x) => sum + (x - meanBL) ** 2, 0);

  // Degrees of freedom
  const dfPlan = 1;
  const dfModel = 1;
  const dfInteraction = 1;
  const dfResidual = N - 4;

  // Mean squares
  const msPlan = ssPlan / dfPlan;
  const msModel = ssModel / dfModel;
  const msInteraction = ssInteraction / dfInteraction;
  const msResidual = dfResidual > 0 ? ssResidual / dfResidual : 0;

  // F-statistics
  const fFromMs = (msEffect: number, msRes: number) => {
    if (msRes === 0) return msEffect === 0 ? 0 : Number.POSITIVE_INFINITY;
    return msEffect / msRes;
  };
  const fPlan = fFromMs(msPlan, msResidual);
  const fModel = fFromMs(msModel, msResidual);
  const fInteraction = fFromMs(msInteraction, msResidual);

  // P-values from F-distribution
  const pPlan = 1 - fDistCDF(fPlan, dfPlan, dfResidual);
  const pModel = 1 - fDistCDF(fModel, dfModel, dfResidual);
  const pInteraction = 1 - fDistCDF(fInteraction, dfInteraction, dfResidual);

  return {
    planEffect: { f: fPlan, p: pPlan, significant: pPlan < 0.05 },
    modelEffect: { f: fModel, p: pModel, significant: pModel < 0.05 },
    interaction: { f: fInteraction, p: pInteraction, significant: pInteraction < 0.05 },
    residualMS: msResidual,
    grandMean,
  };
}

// ============================================================================
// Distribution CDFs (using approximations)
// ============================================================================

/**
 * Compute the CDF of the t-distribution using the regularized incomplete beta function.
 * P(T <= t) for t-distribution with df degrees of freedom.
 */
function tDistCDF(t: number, df: number): number {
  if (df <= 0) return 0.5;
  const x = df / (df + t * t);
  const prob = 0.5 * incompleteBeta(x, df / 2, 0.5);
  return t >= 0 ? 1 - prob : prob;
}

/**
 * Compute the CDF of the F-distribution using the regularized incomplete beta function.
 * P(F <= f) for F-distribution with df1 and df2 degrees of freedom.
 */
function fDistCDF(f: number, df1: number, df2: number): number {
  if (f <= 0) return 0;
  if (df1 <= 0 || df2 <= 0) return 0;
  const x = (df1 * f) / (df1 * f + df2);
  return incompleteBeta(x, df1 / 2, df2 / 2);
}

/**
 * Regularized incomplete beta function I_x(a, b).
 * Uses continued fraction expansion for numerical stability.
 */
function incompleteBeta(x: number, a: number, b: number): number {
  if (x === 0) return 0;
  if (x === 1) return 1;

  // Use symmetry relation if x > (a+1)/(a+b+2)
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - incompleteBeta(1 - x, b, a);
  }

  const lnBeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta) / a;

  // Lentz's algorithm for continued fraction
  const maxIter = 200;
  const eps = 1e-14;
  let f = 1;
  let c = 1;
  let d = 0;

  for (let m = 0; m <= maxIter; m++) {
    const m2 = 2 * m;

    // Even term
    let num: number;
    if (m === 0) {
      num = 1;
    } else {
      num = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    }

    d = 1 + num * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;

    c = 1 + num / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;

    f *= c * d;

    // Odd term
    num = -((a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));

    d = 1 + num * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;

    c = 1 + num / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;

    const delta = c * d;
    f *= delta;

    if (Math.abs(delta - 1) < eps) {
      break;
    }
  }

  return front * (f - 1);
}

/**
 * Log gamma function using Lanczos approximation.
 */
function lnGamma(z: number): number {
  if (z <= 0) return Infinity;

  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];

  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  }

  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) {
    x += c[i] / (z + i);
  }

  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/**
 * Calculate descriptive statistics for a group.
 */
export function calculateStats(values: number[]): {
  mean: number;
  sd: number;
  min: number;
  max: number;
  n: number;
} {
  const n = values.length;
  if (n === 0) return { mean: 0, sd: 0, min: 0, max: 0, n: 0 };

  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (n - 1 || 1);
  const sd = Math.sqrt(variance);

  return {
    mean,
    sd,
    min: Math.min(...values),
    max: Math.max(...values),
    n,
  };
}

/**
 * Format test result for display/reporting.
 */
export function formatTestResult(result: TestResult): string {
  const lines = [
    `${result.testType.toUpperCase()} TEST RESULTS`,
    `Score: ${result.rawScore}/${result.questions.length} (${result.score.toFixed(1)}%)`,
    '',
    'By Topic:',
  ];

  for (const [topicId, stats] of Object.entries(result.byTopic)) {
    const pct = ((stats.correct / stats.total) * 100).toFixed(0);
    lines.push(`  ${topicId}: ${stats.correct}/${stats.total} (${pct}%)`);
  }

  return lines.join('\n');
}
