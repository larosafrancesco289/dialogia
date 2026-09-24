// Module: tutor tooling scenarios
// Responsibility: the simulated learners, ported from the paper's four study scenarios
// (the `research` branch, src/tooling/eval/ablationScenarios.ts): who they are, what they
// already know, and where they are weak.

/**
 * A topic the simulated learner gets wrong. The tutor names its own topics, so
 * a gap is matched by keyword against a quiz's topic (id, name, description,
 * objectives) and, failing that, the question itself.
 */
export type KnowledgeGap = {
  topic: string;
  keywords: string[];
  /** Chance of a wrong answer on an item about this topic, before any teaching. */
  errorRate: number;
  misconception: string;
};

/** A topic the learner already knows; the only topics quiet "mark known" edits may touch. */
export type KnownTopic = { topic: string; keywords: string[] };

export type Scenario = {
  id: string;
  title: string;
  level: 'beginner' | 'intermediate';
  goal: string;
  constraints: string[];
  persona: string;
  successCriteria: string;
  known: KnownTopic[];
  gaps: KnowledgeGap[];
  /** Exchanges when --turns is not given. */
  exchanges: number;
};

const linearEquations: Scenario = {
  id: 'linear_equations',
  title: 'Algebra: solving linear equations',
  level: 'beginner',
  goal: 'Master solving linear equations of the form ax + b = c',
  constraints: [
    'High school student preparing for a test in 3 days',
    'The test covers two-step equations and word problems; basic operations will not be tested',
    'Nervous about word problems especially',
    'Already practised inverse operations and one-step equations in class and feels confident on those',
  ],
  persona:
    'Anxious high-schooler who second-guesses answers and prefers step-by-step guidance before trying alone.',
  successCriteria:
    'Solves equations with the variable on one side, handles negative coefficients, and sets up a simple word problem.',
  known: [
    { topic: 'inverse operations', keywords: ['inverse operation'] },
    { topic: 'one-step equations', keywords: ['one-step', 'one step'] },
  ],
  gaps: [
    {
      topic: 'two-step equations',
      keywords: ['two-step', 'two step', 'multi-step', 'ax + b'],
      errorRate: 0.8,
      misconception: 'Applies operations in the wrong order (divides before subtracting).',
    },
    {
      topic: 'word problems',
      keywords: ['word problem', 'translate', 'story', 'sentence', 'represents'],
      errorRate: 0.9,
      misconception: 'Confuses "doubled and increased by" with "increased then doubled".',
    },
  ],
  exchanges: 8,
};

const differentiation: Scenario = {
  id: 'calculus_derivatives',
  title: 'Calculus: differentiation rules',
  level: 'intermediate',
  goal: 'Master basic differentiation rules and apply them to polynomial functions',
  constraints: [
    'College freshman preparing for a midterm',
    'The midterm focuses on combining rules (sum rule) and rate-of-change applications, not single rules in isolation',
    'Comfortable with the power rule and the constant rule on their own from homework',
    'Weak algebra foundation',
  ],
  persona:
    'College freshman who struggles with abstraction but does well with worked examples and visual intuition.',
  successCriteria:
    'Differentiates polynomials with the power, constant and sum rules, and explains the limit definition conceptually.',
  known: [
    { topic: 'power rule', keywords: ['power rule'] },
    { topic: 'constant rule', keywords: ['constant rule', 'constant multiple'] },
  ],
  gaps: [
    {
      topic: 'limit definition',
      keywords: ['limit', 'first principles', 'tangent', 'instantaneous', 'h to 0', 'h → 0'],
      errorRate: 0.7,
      misconception: 'Confuses the derivative with the integral: thinks a derivative finds area.',
    },
    {
      topic: 'sum rule',
      keywords: ['sum rule', 'difference rule', 'term by term', 'each term', 'polynomial'],
      errorRate: 0.8,
      misconception: 'Forgets to differentiate each term separately.',
    },
  ],
  exchanges: 8,
};

const pythonDebugging: Scenario = {
  id: 'python_debugging',
  title: 'Programming: Python debugging',
  level: 'beginner',
  goal: 'Learn to identify and fix common Python bugs',
  constraints: [
    'New to programming, with a homework assignment due tomorrow',
    'The code runs but gives wrong output: the job is finding logic errors, not syntax problems',
    'Already comfortable reading error messages and fixing syntax errors from class',
    'Prefers hands-on practice over theory',
  ],
  persona:
    'Curious new coder who makes common mistakes but is eager to understand why errors happen.',
  successCriteria:
    'Reads error messages, spots off-by-one errors, and traces variable values through simple loops.',
  known: [
    { topic: 'error messages', keywords: ['error message', 'traceback'] },
    { topic: 'syntax errors', keywords: ['syntax'] },
  ],
  gaps: [
    {
      topic: 'logic errors',
      keywords: ['logic error', 'off-by-one', 'off by one', 'range(', 'range', 'wrong output'],
      errorRate: 0.8,
      misconception: 'Thinks range(1, 5) produces [1, 2, 3, 4, 5], including the end value.',
    },
    {
      topic: 'print debugging',
      keywords: ['print', 'trace', 'inspect'],
      errorRate: 0.5,
      misconception: 'Unsure when print debugging helps compared with other approaches.',
    },
  ],
  exchanges: 8,
};

const bayesRule: Scenario = {
  id: 'bayes_rule',
  title: "Statistics: conditional probability and Bayes' rule",
  level: 'intermediate',
  goal: "Apply Bayes' rule to medical tests and other real-world problems",
  constraints: [
    'Tends to rush through problems',
    "Stats final tomorrow has a section on Bayes' rule in medical and diagnostic testing; basic probability is not on the exam",
    'Took a probability course last semester and considers a basic probability review unnecessary',
    'Strong intuitions about probability that are often wrong (for example base rate neglect)',
  ],
  persona:
    'Overconfident learner who answers quickly and sometimes skips justification, but takes gentle correction well.',
  successCriteria:
    'Computes the posterior in a medical test problem and explains why base rates matter.',
  known: [{ topic: 'basic probability', keywords: ['basic probability', 'probability review'] }],
  gaps: [
    {
      topic: 'base rates',
      keywords: ['base rate', 'prevalence', 'prior'],
      errorRate: 0.7,
      misconception: 'Ignores the base rate when judging a test result.',
    },
    {
      topic: "Bayes' formula",
      keywords: ['bayes', 'likelihood', 'posterior', 'p(a|b)', 'p(b|a)'],
      errorRate: 0.8,
      misconception: "Confuses P(A|B) with P(B|A) (the prosecutor's fallacy).",
    },
    {
      topic: 'medical tests',
      keywords: ['false positive', 'sensitivity', 'specificity', 'screening', 'medical test'],
      errorRate: 0.9,
      misconception:
        'Thinks a highly accurate test means a positive result almost surely means disease.',
    },
  ],
  exchanges: 8,
};

export const SCENARIOS: readonly Scenario[] = [
  linearEquations,
  differentiation,
  pythonDebugging,
  bayesRule,
];

export function findScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

function mentions(text: string, keywords: string[]): boolean {
  const haystack = text.toLowerCase();
  return keywords.some((k) => haystack.includes(k.toLowerCase()));
}

/** The first gap whose keywords the text mentions. */
export function matchGap(scenario: Scenario, text: string): KnowledgeGap | undefined {
  return scenario.gaps.find((gap) => mentions(text, [gap.topic, ...gap.keywords]));
}

export function matchKnown(scenario: Scenario, text: string): KnownTopic | undefined {
  if (matchGap(scenario, text)) return undefined;
  return scenario.known.find((known) => mentions(text, [known.topic, ...known.keywords]));
}
