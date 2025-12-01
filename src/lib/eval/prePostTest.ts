import type { TestQuestion, KnowledgeGap } from '@/lib/eval/ablationScenarios';
import type { ModelTransport } from '@/lib/types';
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
  apiKey: string;
  transport: ModelTransport;
  model: string;
  studentPersona?: string;
  priorKnowledge?: string; // Description of what the student knows
  testType: 'pre' | 'post'; // Whether this is pre or post test
  knowledgeGaps?: KnowledgeGap[]; // Topics the student doesn't know (for pre-test)
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
async function askQuestion(
  question: TestQuestion,
  options: TestAdminOptions,
): Promise<number> {
  const optionsText = question.options
    .map((opt, i) => `${i}. ${opt}`)
    .join('\n');

  const prompt = buildStudentPrompt(question, optionsText, options);

  const response = await getChatCompletion()({
    apiKey: options.apiKey,
    transport: options.transport,
    model: options.model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3, // Some randomness to simulate realistic student behavior
    max_tokens: 10,
  });

  const text = extractText(response);
  return parseAnswer(text, question.options.length);
}

function buildStudentPrompt(
  question: TestQuestion,
  optionsText: string,
  options: TestAdminOptions,
): string {
  // Check if this topic has a knowledge gap (for pre-test calibration)
  const gap = options.knowledgeGaps?.find((g) => g.topicId === question.topicId);
  const hasGap = options.testType === 'pre' && !!gap;
  const gapErrorRate = gap ? Math.min(Math.max(gap.errorRate, 0), 1) : 0;
  const shouldForceIncorrect = hasGap && Math.random() < gapErrorRate;

  const gapInstruction = (() => {
    if (!hasGap) return null;
    const misconception = gap?.misconception ? `Your misconception: ${gap.misconception}` : null;

    if (shouldForceIncorrect) {
      return [
        `CRITICAL INSTRUCTION: You do NOT understand the topic "${question.topicId}" well.`,
        misconception,
        'You MUST answer this question INCORRECTLY. Do NOT pick the correct answer. Pick a plausible wrong answer based on your misconception.',
      ]
        .filter(Boolean)
        .join(' ');
    }

    return [
      `You are unsure about the topic "${question.topicId}" and may hold a misconception.`,
      misconception,
      'Try to answer to the best of your knowledge, but this uncertainty might still cause mistakes.',
    ]
      .filter(Boolean)
      .join(' ');
  })();

  const parts = [
    'You are a student taking a test.',
    options.studentPersona ? `Student persona: ${options.studentPersona}` : null,
    options.priorKnowledge ? `Prior knowledge: ${options.priorKnowledge}` : null,
    '',

    // For pre-test with knowledge gaps: probabilistically force incorrect answers
    gapInstruction,

    // For post-test: acknowledge learning happened
    options.testType === 'post'
      ? 'You just completed tutoring on this topic and now understand it much better. Answer to the best of your improved knowledge.'
      : null,

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
      .map((c) => (typeof c === 'string' ? c : c?.text ?? ''))
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
    ((group1.length - 1) * var1 + (group2.length - 1) * var2) /
      (group1.length + group2.length - 2),
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
