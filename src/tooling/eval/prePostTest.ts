import type { TestQuestion, KnowledgeGap } from '@/tooling/eval/ablationScenarios';
import type { TransportAuth } from '@/lib/auth/transport';
import { getChatCompletion, type PipelineClient } from '@/lib/agent/pipelineClient';

// ============================================================================
// Seeded RNG Utilities
// ============================================================================

function seededRandom(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(runId: string, questionId: string): number {
  let hash = 0;
  const str = `${runId}:${questionId}`;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash = hash & hash;
  }
  return hash;
}

// ============================================================================
// Evidence Matching Utilities
// ============================================================================

/**
 * Normalize text for fuzzy matching by lowercasing and collapsing whitespace.
 */
export function normalizeForMatching(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Extract the first balanced JSON object from text using brace counting.
 * Handles LLM responses that include extra closing braces or trailing content.
 */
function extractFirstBalancedJson(text: string): string | undefined {
  const start = text.indexOf('{');
  if (start === -1) return undefined;

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
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
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return undefined;
}

/** Words too common to count as meaningful evidence tokens. */
const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'shall',
  'can',
  'need',
  'must',
  'and',
  'but',
  'or',
  'nor',
  'not',
  'so',
  'yet',
  'both',
  'either',
  'neither',
  'each',
  'every',
  'all',
  'any',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'only',
  'own',
  'same',
  'than',
  'too',
  'very',
  'just',
  'because',
  'as',
  'until',
  'while',
  'of',
  'at',
  'by',
  'for',
  'with',
  'about',
  'against',
  'between',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'to',
  'from',
  'up',
  'down',
  'in',
  'out',
  'on',
  'off',
  'over',
  'under',
  'again',
  'further',
  'then',
  'once',
  'here',
  'there',
  'when',
  'where',
  'why',
  'how',
  'what',
  'which',
  'who',
  'whom',
  'this',
  'that',
  'these',
  'those',
  'i',
  'me',
  'my',
  'we',
  'our',
  'you',
  'your',
  'he',
  'him',
  'his',
  'she',
  'her',
  'it',
  'its',
  'they',
  'them',
  'their',
]);

/**
 * Verify evidence via fuzzy token overlap.
 * Returns true if ≥60% of meaningful evidence tokens appear in the transcript.
 * This replaces exact substring matching which fails on LLM paraphrases.
 */
export function verifyEvidenceTokenOverlap(evidence: string, transcript: string): boolean {
  const normalizedEvidence = normalizeForMatching(evidence);
  if (normalizedEvidence.length < 10) return false;

  const tokens = normalizedEvidence.split(' ').filter((w) => w.length > 3 && !STOP_WORDS.has(w));
  if (tokens.length === 0) return false;

  const normalizedTranscript = normalizeForMatching(transcript);
  let matchCount = 0;
  for (const token of tokens) {
    if (normalizedTranscript.includes(token)) matchCount++;
  }

  return matchCount / tokens.length >= 0.6;
}

/**
 * Check that an evidence quote is topically relevant by requiring at least one
 * topic-specific keyword to appear in the quote. This prevents false positives
 * where the LLM cites generic transcript text as evidence for a specific topic.
 */
export function verifyEvidenceRelevance(evidence: string, keywords: string[]): boolean {
  if (keywords.length === 0) return true; // No keywords configured = skip check
  const normalized = normalizeForMatching(evidence);
  return keywords.some((kw) => normalized.includes(normalizeForMatching(kw)));
}

/**
 * Extract only tutor turns from a transcript.
 * Tutor turns are identified by lines starting with "Tutor:" or "Tutor (".
 */
export function extractTutorTurns(transcript: string): string {
  const lines = transcript.split('\n');
  const tutorBlocks: string[] = [];
  let current: string[] = [];
  let inTutor = false;

  const isTutorHeader = (line: string): boolean =>
    line.startsWith('Tutor:') || line.startsWith('Tutor (');
  const isRoleHeader = (line: string): boolean =>
    /^(Tutor|Student|System|Assistant|User|Tool)(:|\s*\()/.test(line);
  const flush = (): void => {
    if (current.length === 0) return;
    const block = current.join('\n').replace(/\s+$/, '');
    if (block.length > 0) tutorBlocks.push(block);
    current = [];
  };

  for (const line of lines) {
    const trimmed = line.trimStart();
    if (isRoleHeader(trimmed)) {
      if (inTutor) flush();
      inTutor = isTutorHeader(trimmed);
      if (inTutor) current.push(line);
      continue;
    }
    if (inTutor) current.push(line);
  }

  if (inTutor) flush();
  return tutorBlocks.join('\n\n');
}

type EvidenceCorpus = {
  label: string;
  text: string;
};

/**
 * Build the exact transcript slice used both in prompt instructions and verification.
 */
function resolveEvidenceCorpus(transcript: string, restrictToTutorTurns: boolean): EvidenceCorpus {
  if (!restrictToTutorTurns) {
    return { label: 'SESSION TRANSCRIPT', text: transcript };
  }

  const tutorOnly = extractTutorTurns(transcript);
  if (tutorOnly.trim().length > 0) {
    return { label: 'TUTOR TURNS ONLY', text: tutorOnly };
  }

  // Fallback keeps evidence checks usable when role headers are absent.
  return { label: 'SESSION TRANSCRIPT', text: transcript };
}

export type AnswerMetadata = {
  forcedIncorrect?: boolean;
  forcedFromTopicGap?: boolean;
  evidenceVerified?: boolean;
  evidenceQuote?: string;
  jsonParseFailed?: boolean; // True when JSON parsing fails for evidence-required questions
  rawResponse?: string; // First 500 chars of raw response for debugging
};

export type TestResult = {
  testType: 'pre' | 'post';
  questions: TestQuestion[];
  answers: number[]; // Index selected for each question
  correct: boolean[];
  score: number; // 0-100
  rawScore: number; // Count of correct
  byTopic: Record<string, { correct: number; total: number }>;
  answerMetadata?: AnswerMetadata[];
  administeredAt: number;
  // Gap-only metrics (questions targeting knowledge gaps)
  gapScore?: number; // 0-100 for gap items only
  gapRawScore?: number; // Count correct on gap items
  gapItemCount?: number; // Total gap items
};

export type TestAdminOptions = {
  auth: TransportAuth;
  model: string;
  pipelineClient?: PipelineClient;
  studentPersona?: string;
  priorKnowledge?: string; // Description of what the student knows
  testType: 'pre' | 'post'; // Whether this is pre or post test
  knowledgeGaps?: KnowledgeGap[]; // Topics the student doesn't know
  sessionTranscript?: string; // The actual tutoring session content
  runId?: string; // For deterministic seeding
  errorSeed?: string; // Condition-independent seed for deterministic forced errors
  restrictEvidenceToTutorTurns?: boolean; // Whether to restrict evidence matching to tutor turns (default: true)
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
  const answerMetadata: AnswerMetadata[] = [];
  const byTopic: Record<string, { correct: number; total: number }> = {};

  for (const question of questions) {
    const result = await askQuestion(question, options);
    answers.push(result.answer);
    answerMetadata.push({
      forcedIncorrect: result.forcedIncorrect,
      forcedFromTopicGap: result.forcedFromTopicGap,
      evidenceVerified: result.evidenceVerified,
      evidenceQuote: result.evidenceQuote,
      jsonParseFailed: result.jsonParseFailed,
      rawResponse: result.rawResponse,
    });
    const isCorrect = result.answer === question.correctIndex;
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

  // Calculate gap-only metrics
  const gapTopicIds = new Set(options.knowledgeGaps?.map((g) => g.topicId) ?? []);
  const gapResults = questions
    .map((q, i) => ({ q, correct: correct[i] }))
    .filter(({ q }) => gapTopicIds.has(q.topicId));
  const gapRawScore = gapResults.filter((r) => r.correct).length;
  const gapItemCount = gapResults.length;
  const gapScore = gapItemCount > 0 ? (gapRawScore / gapItemCount) * 100 : undefined;

  return {
    testType,
    questions,
    answers,
    correct,
    score,
    rawScore,
    byTopic,
    answerMetadata,
    administeredAt: Date.now(),
    gapScore,
    gapRawScore,
    gapItemCount,
  };
}

type QuestionAnswer = {
  answer: number;
  forcedIncorrect?: boolean;
  forcedFromTopicGap?: boolean;
  evidenceVerified?: boolean;
  evidenceQuote?: string;
  jsonParseFailed?: boolean;
  rawResponse?: string;
};

/**
 * Ask a single MCQ question to the simulated student.
 */
async function askQuestion(
  question: TestQuestion,
  options: TestAdminOptions,
): Promise<QuestionAnswer> {
  const gap = options.knowledgeGaps?.find((g) => g.topicId === question.topicId);
  const isPreTest = options.testType === 'pre';
  const isPostTest = options.testType === 'post';

  // Deterministic forced error for pre-test gap topics - bypass LLM entirely
  if (isPreTest && gap) {
    const rng = seededRandom(
      hashSeed(options.errorSeed ?? options.runId ?? 'default', question.id),
    );
    if (rng() < (gap.errorRate ?? 0.8)) {
      // PROGRAMMATICALLY select wrong answer - bypass LLM entirely
      const wrongIndices = question.options
        .map((_, i) => i)
        .filter((i) => i !== question.correctIndex);
      const wrongIdx = Math.floor(rng() * wrongIndices.length);
      return {
        answer: wrongIndices[wrongIdx],
        forcedIncorrect: true,
        forcedFromTopicGap: true,
      };
    }
  }

  const optionsText = question.options.map((opt, i) => `${i}. ${opt}`).join('\n');
  const prompt = buildStudentPrompt(question, optionsText, options);

  // Post-test gap questions require JSON with evidence; increase token budget accordingly
  const requiresEvidence = isPostTest && gap && options.sessionTranscript;

  const response = await getChatCompletion(options.pipelineClient)({
    auth: options.auth,
    model: options.model,
    messages: [{ role: 'user', content: prompt }],
    temperature: options.testType === 'post' ? 0.1 : 0.3,
    maxTokens: requiresEvidence ? 300 : 10,
  });

  const text = extractText(response);

  const fallbackSeed = hashSeed(options.errorSeed ?? options.runId ?? 'default', question.id);

  // Evidence gating: if evidence is NOT verified, the student cannot prove the topic
  // was covered, so force the answer to the misconception-aligned distractor.
  // This addresses the ceiling effect where the LLM student knows answers regardless.
  if (requiresEvidence) {
    const transcript = options.sessionTranscript!;
    const restrictToTutorTurns = options.restrictEvidenceToTutorTurns !== false;
    const evidenceCorpus = resolveEvidenceCorpus(transcript, restrictToTutorTurns);
    const misconceptionAnswer = validatedDistractor(gap, question);
    const jsonStr = extractFirstBalancedJson(text);

    // No JSON found — evidence not provided, force misconception distractor
    if (!jsonStr) {
      return {
        answer: misconceptionAnswer,
        evidenceVerified: false,
        jsonParseFailed: true,
        rawResponse: text.slice(0, 500),
      };
    }

    try {
      const parsed = JSON.parse(jsonStr) as { answer?: number; evidence?: string };
      const evidence = parsed.evidence || '';

      // Verify evidence: (1) quote exists in transcript, (2) quote is topically relevant
      const overlapOk = verifyEvidenceTokenOverlap(evidence, evidenceCorpus.text);
      const relevanceOk = verifyEvidenceRelevance(evidence, gap.evidenceKeywords ?? []);
      const evidenceVerified = overlapOk && relevanceOk;

      if (evidenceVerified) {
        // Evidence verified — trust the LLM answer
        const answer = parsed.answer ?? parseAnswer(text, question.options.length, fallbackSeed);
        return {
          answer,
          evidenceVerified: true,
          evidenceQuote: evidence,
        };
      }

      // Evidence NOT verified — force misconception distractor
      return {
        answer: misconceptionAnswer,
        evidenceVerified: false,
        evidenceQuote: evidence,
      };
    } catch {
      // JSON parse error — evidence not available, force misconception distractor
      return {
        answer: misconceptionAnswer,
        evidenceVerified: false,
        jsonParseFailed: true,
        rawResponse: text.slice(0, 500),
      };
    }
  }

  return { answer: parseAnswer(text, question.options.length, fallbackSeed) };
}

function buildStudentPrompt(
  question: TestQuestion,
  optionsText: string,
  options: TestAdminOptions,
): string {
  const gap = options.knowledgeGaps?.find((g) => g.topicId === question.topicId);

  // Pre-Test Logic:
  // Forced errors are now handled programmatically in askQuestion before this is called
  const isPreTest = options.testType === 'pre';

  // Post-Test Logic:
  // If there is a transcript, the student must prove the transcript taught them.
  // Otherwise, they fall back to the misconception.
  const isPostTest = options.testType === 'post';
  const hasTranscript = !!options.sessionTranscript;

  let contextInstruction = '';
  let answerInstruction =
    'Answer the following multiple choice question by responding with ONLY the number (0, 1, 2, or 3) of your chosen answer.\nDo not explain your reasoning, just output the number.';

  if (isPreTest) {
    if (gap) {
      // Non-forced case: student is uncertain but may get lucky
      contextInstruction = `
You are unsure about the topic "${question.topicId}".
Misconception: "${gap.misconception}".
Try to answer to the best of your knowledge, but you are prone to mistakes on this topic.
`;
    } else {
      contextInstruction = `
You are taking a pre-test to measure what you already know about "${question.topicId}".
Answer honestly based on your current knowledge. If you are unsure, make your best guess.
`;
    }
  } else if (isPostTest) {
    if (hasTranscript && gap) {
      const transcript = options.sessionTranscript!;
      const restrictToTutorTurns = options.restrictEvidenceToTutorTurns !== false;
      const evidenceCorpus = resolveEvidenceCorpus(transcript, restrictToTutorTurns);

      // Post-test with transcript AND gap: require JSON with evidence
      contextInstruction = `
INSTRUCTION: You have just finished a tutoring session on "${question.topicId}".
You MUST respond with JSON in this exact format:
{"answer": <0-3>, "evidence": "<exact quote from the provided evidence corpus>"}

Rules:
- If the transcript SPECIFICALLY teaches "${question.topicId}" or corrects your misconception ("${gap.misconception}"),
  provide the EXACT quote from the provided evidence corpus and answer correctly.
- The evidence must demonstrate actual instruction about "${question.topicId}" — generic introductions, greetings, or teaching about OTHER topics do NOT count.
- If the topic was NOT covered or only mentioned in passing, set evidence to "" and answer based on your misconception.
- The evidence MUST be a verbatim substring from the provided evidence corpus.

--- ${evidenceCorpus.label} ---
${evidenceCorpus.text}
----------------------------
`;
      answerInstruction =
        'Respond with JSON only: {"answer": <number>, "evidence": "<exact quote or empty string>"}';
    } else if (hasTranscript) {
      // Post-test with transcript but no gap
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
    answerInstruction,
    '',
    `Question: ${question.question}`,
    '',
    optionsText,
    '',
    'Your answer:',
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

/**
 * Fallback wrong answer when no misconceptionDistractor is configured.
 * Returns the first wrong option index.
 */
function fallbackWrongAnswer(question: TestQuestion): number {
  for (let i = 0; i < question.options.length; i++) {
    if (i !== question.correctIndex) return i;
  }
  return 0;
}

/**
 * Validate and return the misconception distractor for a knowledge gap.
 * Throws if the configured distractor is out of bounds or equals the correct answer.
 * Falls back to the first wrong option when no distractor is configured.
 */
function validatedDistractor(gap: KnowledgeGap, question: TestQuestion): number {
  const raw = gap.misconceptionDistractor;
  if (raw == null) return fallbackWrongAnswer(question);

  if (raw < 0 || raw >= question.options.length) {
    throw new Error(
      `misconceptionDistractor ${raw} out of bounds for question "${question.id}" with ${question.options.length} options`,
    );
  }
  if (raw === question.correctIndex) {
    throw new Error(
      `misconceptionDistractor ${raw} equals correctIndex for question "${question.id}"`,
    );
  }
  return raw;
}

function parseAnswer(text: string, numOptions: number, seed?: number): number {
  // Try to extract a number from the response
  const match = text.match(/\b([0-3])\b/);
  if (match) {
    const num = parseInt(match[1], 10);
    if (num >= 0 && num < numOptions) {
      return num;
    }
  }
  // Fallback: seeded random answer for reproducibility (simulates confused student)
  const rng = seed != null ? seededRandom(seed) : seededRandom(Date.now());
  return Math.floor(rng() * numOptions);
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
  ciLower: number;
  ciUpper: number;
};

/**
 * Perform Welch's t-test for independent samples with unequal variances.
 * Returns t-statistic, degrees of freedom, and two-tailed p-value.
 */
export function welchTTest(group1: number[], group2: number[]): TTestResult {
  if (group1.length < 2 || group2.length < 2) {
    return {
      t: 0,
      df: 0,
      p: 1,
      significant: false,
      mean1: 0,
      mean2: 0,
      se: 0,
      ciLower: 0,
      ciUpper: 0,
    };
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
    const diff = mean1 - mean2;
    return {
      t,
      df: n1 + n2 - 2,
      p,
      significant: p < 0.05,
      mean1,
      mean2,
      se: 0,
      ciLower: diff,
      ciUpper: diff,
    };
  }

  const t = (mean1 - mean2) / se;

  // Welch-Satterthwaite degrees of freedom approximation
  const num = (var1 / n1 + var2 / n2) ** 2;
  const denom = (var1 / n1) ** 2 / (n1 - 1) + (var2 / n2) ** 2 / (n2 - 1);
  const df = denom > 0 ? num / denom : n1 + n2 - 2;

  // Calculate p-value using t-distribution CDF
  const p = 2 * (1 - tDistCDF(Math.abs(t), df));

  // 95% CI for the mean difference
  const tCrit = tQuantile(0.975, df);
  const diff = mean1 - mean2;
  const ciLower = diff - tCrit * se;
  const ciUpper = diff + tCrit * se;

  return {
    t,
    df,
    p,
    significant: p < 0.05,
    mean1,
    mean2,
    se,
    ciLower,
    ciUpper,
  };
}

export type AnovaEffect = {
  f: number;
  p: number;
  significant: boolean;
  etaSquared: number;
};

export type AnovaResult = {
  planEffect: AnovaEffect;
  modelEffect: AnovaEffect;
  interaction: AnovaEffect;
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
      planEffect: { f: 0, p: 1, significant: false, etaSquared: 0 },
      modelEffect: { f: 0, p: 1, significant: false, etaSquared: 0 },
      interaction: { f: 0, p: 1, significant: false, etaSquared: 0 },
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

  // Partial eta-squared: η²_p = SS_effect / (SS_effect + SS_residual)
  const etaSqPlan = ssResidual + ssPlan > 0 ? ssPlan / (ssPlan + ssResidual) : 0;
  const etaSqModel = ssResidual + ssModel > 0 ? ssModel / (ssModel + ssResidual) : 0;
  const etaSqInteraction =
    ssResidual + ssInteraction > 0 ? ssInteraction / (ssInteraction + ssResidual) : 0;

  return {
    planEffect: { f: fPlan, p: pPlan, significant: pPlan < 0.05, etaSquared: etaSqPlan },
    modelEffect: { f: fModel, p: pModel, significant: pModel < 0.05, etaSquared: etaSqModel },
    interaction: {
      f: fInteraction,
      p: pInteraction,
      significant: pInteraction < 0.05,
      etaSquared: etaSqInteraction,
    },
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
 * Approximate the quantile of the t-distribution via bisection on tDistCDF.
 * Returns t such that P(T <= t) ≈ p for the given degrees of freedom.
 */
function tQuantile(p: number, df: number): number {
  if (df <= 0 || p <= 0 || p >= 1) return 0;
  let lo = -20;
  let hi = 20;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (tDistCDF(mid, df) < p) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-10) break;
  }
  return (lo + hi) / 2;
}

export type DescriptiveStats = {
  mean: number;
  sd: number;
  min: number;
  max: number;
  n: number;
  ci95Lower: number;
  ci95Upper: number;
};

/**
 * Calculate descriptive statistics for a group.
 */
export function calculateStats(values: number[]): DescriptiveStats {
  const n = values.length;
  if (n === 0) return { mean: 0, sd: 0, min: 0, max: 0, n: 0, ci95Lower: 0, ci95Upper: 0 };

  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (n - 1 || 1);
  const sd = Math.sqrt(variance);

  // 95% CI for the mean using t-distribution
  let ci95Lower = mean;
  let ci95Upper = mean;
  if (n >= 2) {
    const se = sd / Math.sqrt(n);
    const tCrit = tQuantile(0.975, n - 1);
    ci95Lower = mean - tCrit * se;
    ci95Upper = mean + tCrit * se;
  }

  return {
    mean,
    sd,
    min: Math.min(...values),
    max: Math.max(...values),
    n,
    ci95Lower,
    ci95Upper,
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
