import type { TutorScenario } from '@/tooling/eval/tutorScenarios';
import type { LearningPlan, LearningPlanNode } from '@/lib/types';

export const DEFAULT_ABLATION_TUTOR_MODEL_ID = 'google/gemini-3-flash-preview';

/**
 * MCQ question for pre/post testing.
 */
export type TestQuestion = {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  /** Maps to a node ID in the learning plan DAG. */
  topicId: string;
  difficulty: 'easy' | 'medium' | 'hard';
};

/**
 * Knowledge gap definition for simulating realistic student knowledge.
 * Used to calibrate pre-test scores so learning gains can be measured.
 */
export type KnowledgeGap = {
  topicId: string;
  /** What the student wrongly believes. */
  misconception?: string;
  /** Probability of answering incorrectly (0-1). */
  errorRate: number;
  /** Post-test option index aligned with the misconception (used as forced answer when evidence fails). */
  misconceptionDistractor?: number;
  /** Topic-specific keywords the evidence quote must contain (at least one) to be considered relevant. */
  evidenceKeywords?: string[];
};

/**
 * Ablation scenario with pre/post tests and DAG structure.
 */
export type AblationScenario = TutorScenario & {
  planStructure: {
    goal: string;
    nodes: Omit<LearningPlanNode, 'status' | 'startedAt' | 'completedAt'>[];
  };
  preTestQuestions: TestQuestion[];
  /** Isomorphic to pre-test (same topics, comparable difficulty). */
  postTestQuestions: TestQuestion[];
  /** Topics the student does not know initially -- drives pre-test error forcing and post-test evidence gating. */
  knowledgeGaps: KnowledgeGap[];
};

/**
 * Generate a learning plan from scenario's plan structure.
 * Marks the first node without prerequisites as 'in_progress' so the tutor
 * can enter teaching phase immediately (headless mode doesn't have UI approval flow).
 */
export function generatePlanFromScenario(scenario: AblationScenario): LearningPlan {
  const nodes: LearningPlanNode[] = scenario.planStructure.nodes.map((node) => ({
    ...node,
    status: 'not_started' as const,
  }));

  // Find the first node with no prerequisites and mark it as in_progress
  // This ensures the tutor starts in teaching phase rather than planning phase
  const firstReadyIndex = nodes.findIndex(
    (node) => !node.prerequisites || node.prerequisites.length === 0,
  );
  if (firstReadyIndex >= 0) {
    nodes[firstReadyIndex] = {
      ...nodes[firstReadyIndex],
      status: 'in_progress' as const,
      startedAt: Date.now(),
    };
  }

  return {
    goal: scenario.planStructure.goal,
    generatedAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
    nodes,
  };
}

// ============================================================================
// SCENARIO 1: Linear Equations (Beginner Math)
// ============================================================================
const linearEquationsScenario: AblationScenario = {
  id: 'linear_equations',
  title: 'Algebra: Solving Linear Equations',
  topic: 'Solving linear equations with one variable',
  level: 'beginner',
  goal: 'Master solving linear equations of the form ax + b = c',
  constraints: [
    'High school student preparing for a test in 3 days',
    'Your test specifically covers two-step equations and word problems — basic operations will not be tested',
    'Nervous about word problems especially',
    'Already practiced inverse operations and one-step equations in class and feel confident on those',
  ],
  maxTurns: 5,
  teacherModelId: DEFAULT_ABLATION_TUTOR_MODEL_ID,
  studentModelId: 'google/gemini-2.5-flash-lite',
  judgeModelId: 'anthropic/claude-haiku-4.5',
  studentPersona:
    'Anxious high-schooler who second-guesses answers and prefers step-by-step guidance before trying alone.',
  successCriteria:
    'Student correctly solves equations with variables on one side, handles negative coefficients, and can set up a simple word problem.',

  planStructure: {
    goal: 'Master solving linear equations',
    nodes: [
      {
        id: 'inverse-operations',
        name: 'Inverse Operations',
        description:
          'Understanding addition/subtraction and multiplication/division as inverse operations',
        objectives: ['Identify inverse operations', 'Apply to isolate terms'],
        prerequisites: [],
        estimatedMinutes: 10,
      },
      {
        id: 'one-step-equations',
        name: 'One-Step Equations',
        description: 'Solving equations like x + 5 = 12 or 3x = 15',
        objectives: [
          'Solve addition/subtraction equations',
          'Solve multiplication/division equations',
        ],
        prerequisites: ['inverse-operations'],
        estimatedMinutes: 15,
      },
      {
        id: 'two-step-equations',
        name: 'Two-Step Equations',
        description: 'Solving equations like 2x + 3 = 11',
        objectives: ['Apply operations in correct order', 'Check solutions'],
        prerequisites: ['one-step-equations'],
        estimatedMinutes: 15,
      },
      {
        id: 'word-problems',
        name: 'Word Problems',
        description: 'Translating word problems into equations',
        objectives: [
          'Identify unknown variable',
          'Set up equation from context',
          'Solve and interpret',
        ],
        prerequisites: ['two-step-equations'],
        estimatedMinutes: 20,
      },
    ],
  },

  preTestQuestions: [
    {
      id: 'pre_1',
      question: 'What is the inverse operation of addition?',
      options: ['Multiplication', 'Subtraction', 'Division', 'Exponentiation'],
      correctIndex: 1,
      topicId: 'inverse-operations',
      difficulty: 'easy',
    },
    {
      id: 'pre_2',
      question: 'Solve for x: x + 7 = 12',
      options: ['x = 19', 'x = 5', 'x = -5', 'x = 7'],
      correctIndex: 1,
      topicId: 'one-step-equations',
      difficulty: 'easy',
    },
    {
      id: 'pre_3',
      question: 'Solve for x: 4x = 20',
      options: ['x = 80', 'x = 16', 'x = 5', 'x = 24'],
      correctIndex: 2,
      topicId: 'one-step-equations',
      difficulty: 'easy',
    },
    {
      id: 'pre_4',
      question: 'Solve for x: 3x + 4 = 19',
      options: ['x = 5', 'x = 7.67', 'x = 15', 'x = 23'],
      correctIndex: 0,
      topicId: 'two-step-equations',
      difficulty: 'medium',
    },
    {
      id: 'pre_5',
      question: 'A number doubled and increased by 6 equals 20. What equation represents this?',
      options: ['2x + 6 = 20', 'x + 6 = 20', '2(x + 6) = 20', '6x + 2 = 20'],
      correctIndex: 0,
      topicId: 'word-problems',
      difficulty: 'medium',
    },
  ],

  postTestQuestions: [
    {
      id: 'post_1',
      question: 'What is the inverse operation of multiplication?',
      options: ['Addition', 'Subtraction', 'Division', 'Squaring'],
      correctIndex: 2,
      topicId: 'inverse-operations',
      difficulty: 'easy',
    },
    {
      id: 'post_2',
      question: 'Solve for y: y - 9 = 15',
      options: ['y = 6', 'y = 24', 'y = -6', 'y = 135'],
      correctIndex: 1,
      topicId: 'one-step-equations',
      difficulty: 'easy',
    },
    {
      id: 'post_3',
      question: 'Solve for y: 6y = 42',
      options: ['y = 252', 'y = 36', 'y = 7', 'y = 48'],
      correctIndex: 2,
      topicId: 'one-step-equations',
      difficulty: 'easy',
    },
    {
      id: 'post_4',
      question: 'Solve for y: 5y - 3 = 22',
      options: ['y = 5', 'y = 3.8', 'y = 25', 'y = 19'],
      correctIndex: 0,
      topicId: 'two-step-equations',
      difficulty: 'medium',
    },
    {
      id: 'post_5',
      question: 'Three times a number minus 8 equals 16. What equation represents this?',
      options: ['3x - 8 = 16', 'x - 8 = 16', '3(x - 8) = 16', '8x - 3 = 16'],
      correctIndex: 0,
      topicId: 'word-problems',
      difficulty: 'medium',
    },
  ],

  // Knowledge gaps: Student struggles with multi-step and word problems (target pre-test: ~60%)
  knowledgeGaps: [
    {
      topicId: 'two-step-equations',
      errorRate: 0.8,
      misconception: 'Often applies operations in wrong order (divides before subtracting)',
      misconceptionDistractor: 1, // post_4: y = 3.8 (divides before subtracting)
      evidenceKeywords: [
        'two-step',
        'two step',
        'reverse order',
        'undo addition',
        'subtraction first',
      ],
    },
    {
      topicId: 'word-problems',
      errorRate: 0.9,
      misconception: 'Confuses "doubled and increased by" with "increased then doubled"',
      misconceptionDistractor: 2, // post_5: 3(x - 8) = 16 ("increased then doubled" pattern)
      evidenceKeywords: [
        'word problem',
        'translate',
        'scenario',
        'story',
        'sentence',
        'represents',
      ],
    },
  ],
};

// ============================================================================
// SCENARIO 2: Calculus Derivatives (Intermediate Math)
// ============================================================================
const derivativesScenario: AblationScenario = {
  id: 'calculus_derivatives',
  title: 'Calculus: Understanding Derivatives',
  topic: 'Derivatives and differentiation rules',
  level: 'intermediate',
  goal: 'Master basic differentiation rules and apply to polynomial functions',
  constraints: [
    'College freshman preparing for midterm exam',
    'Your midterm focuses on combining differentiation rules (sum rule) and rate-of-change applications — it will not test individual rules like power rule or constant rule in isolation',
    'Comfortable with power rule and constant rule individually from homework',
    'Weak algebra foundation',
  ],
  maxTurns: 6,
  teacherModelId: DEFAULT_ABLATION_TUTOR_MODEL_ID,
  studentModelId: 'google/gemini-2.5-flash-lite',
  judgeModelId: 'anthropic/claude-haiku-4.5',
  studentPersona:
    'College freshman who struggles with abstraction but excels with worked examples and visual intuition.',
  successCriteria:
    'Student correctly differentiates polynomials using power, constant, and sum rules, and can explain the limit definition conceptually.',

  planStructure: {
    goal: 'Master basic differentiation',
    nodes: [
      {
        id: 'limit-definition',
        name: 'Limit Definition of Derivative',
        description: "Understanding f'(x) = lim(h→0) [f(x+h) - f(x)]/h",
        objectives: [
          'State the limit definition',
          'Compute simple derivatives from first principles',
        ],
        prerequisites: [],
        estimatedMinutes: 20,
      },
      {
        id: 'power-rule',
        name: 'Power Rule',
        description: 'd/dx[x^n] = nx^(n-1)',
        objectives: ['Apply power rule to monomials', 'Handle negative and fractional exponents'],
        prerequisites: ['limit-definition'],
        estimatedMinutes: 15,
      },
      {
        id: 'constant-rule',
        name: 'Constant Rule',
        description: "d/dx[c] = 0 and d/dx[cf(x)] = c·f'(x)",
        objectives: ['Differentiate constants', 'Factor out constant multipliers'],
        prerequisites: ['limit-definition'],
        estimatedMinutes: 10,
      },
      {
        id: 'sum-rule',
        name: 'Sum and Difference Rule',
        description: "d/dx[f(x) ± g(x)] = f'(x) ± g'(x)",
        objectives: ['Differentiate term by term', 'Combine with power and constant rules'],
        prerequisites: ['power-rule', 'constant-rule'],
        estimatedMinutes: 15,
      },
      {
        id: 'polynomial-practice',
        name: 'Polynomial Differentiation',
        description: 'Combining all rules for polynomial functions',
        objectives: ['Differentiate any polynomial', 'Find tangent line equations'],
        prerequisites: ['sum-rule'],
        estimatedMinutes: 20,
      },
      {
        id: 'applications',
        name: 'Applications: Rates of Change',
        description: 'Interpreting derivatives as instantaneous rate of change',
        objectives: ['Compute velocity from position', 'Interpret derivative in context'],
        prerequisites: ['polynomial-practice'],
        estimatedMinutes: 15,
      },
    ],
  },

  preTestQuestions: [
    {
      id: 'pre_1',
      question: 'The derivative of a function at a point represents:',
      options: [
        'The area under the curve',
        'The slope of the tangent line',
        'The average rate of change',
        'The y-intercept',
      ],
      correctIndex: 1,
      topicId: 'limit-definition',
      difficulty: 'easy',
    },
    {
      id: 'pre_2',
      question: 'What is the derivative of f(x) = x³?',
      options: ['3x²', 'x²', '3x³', 'x⁴/4'],
      correctIndex: 0,
      topicId: 'power-rule',
      difficulty: 'easy',
    },
    {
      id: 'pre_3',
      question: 'What is the derivative of f(x) = 7?',
      options: ['7', '1', '0', '7x'],
      correctIndex: 2,
      topicId: 'constant-rule',
      difficulty: 'easy',
    },
    {
      id: 'pre_4',
      question: 'What is the derivative of f(x) = x² + 3x - 1?',
      options: ['2x + 3', 'x² + 3', '2x + 3x', '2x² + 3'],
      correctIndex: 0,
      topicId: 'sum-rule',
      difficulty: 'medium',
    },
    {
      id: 'pre_5',
      question: 'If position is s(t) = t² + 4t, what is the velocity at t = 2?',
      options: ['8', '12', '4', '6'],
      correctIndex: 0,
      topicId: 'applications',
      difficulty: 'hard',
    },
  ],

  postTestQuestions: [
    {
      id: 'post_1',
      question: 'The limit definition of the derivative involves:',
      options: [
        'Taking h to infinity',
        'Taking h to zero',
        'Finding the average slope',
        'Computing the integral',
      ],
      correctIndex: 1,
      topicId: 'limit-definition',
      difficulty: 'easy',
    },
    {
      id: 'post_2',
      question: 'What is the derivative of g(x) = x⁵?',
      options: ['5x⁴', 'x⁴', '5x⁵', 'x⁶/6'],
      correctIndex: 0,
      topicId: 'power-rule',
      difficulty: 'easy',
    },
    {
      id: 'post_3',
      question: 'What is the derivative of g(x) = -3?',
      options: ['-3', '-1', '0', '3x'],
      correctIndex: 2,
      topicId: 'constant-rule',
      difficulty: 'easy',
    },
    {
      id: 'post_4',
      question: 'What is the derivative of g(x) = 2x³ - 5x + 4?',
      options: ['6x² - 5', '2x³ - 5', '6x² - 5x', '2x² - 5'],
      correctIndex: 0,
      topicId: 'sum-rule',
      difficulty: 'medium',
    },
    {
      id: 'post_5',
      question: 'If position is s(t) = 3t² - 2t, what is the velocity at t = 3?',
      options: ['16', '21', '18', '25'],
      correctIndex: 0,
      topicId: 'applications',
      difficulty: 'hard',
    },
  ],

  // Knowledge gaps: limit-definition and sum-rule (2 gaps, target pre-test: ~60%).
  // Applications gap removed — 3 deep misconceptions was too many for a short session,
  // producing net-negative learning gains across all conditions in pilot testing.
  knowledgeGaps: [
    {
      topicId: 'limit-definition',
      errorRate: 0.7,
      misconception: 'Confuses derivative with integral - thinks derivative finds area',
      misconceptionDistractor: 3, // post_1: "Computing the integral" (confuses derivative with integral)
      evidenceKeywords: [
        'limit',
        'h to zero',
        'h to 0',
        'first principles',
        'tangent',
        'instantaneous',
      ],
    },
    {
      topicId: 'sum-rule',
      errorRate: 0.8,
      misconception: 'Forgets to differentiate each term separately',
      misconceptionDistractor: 2, // post_4: 6x² - 5x (doesn't differentiate -5x correctly)
      evidenceKeywords: ['sum rule', 'term by term', 'each term', 'separately', 'difference rule'],
    },
  ],
};

// ============================================================================
// SCENARIO 3: Python Debugging (Beginner CS)
// ============================================================================
const pythonDebuggingScenario: AblationScenario = {
  id: 'python_debugging',
  title: 'Programming: Python Debugging Basics',
  topic: 'Debugging techniques for Python programs',
  level: 'beginner',
  goal: 'Learn to identify and fix common Python bugs',
  constraints: [
    'New to programming with a homework assignment due tomorrow',
    'Your code runs but produces wrong outputs — you need to find and fix logic errors, not syntax problems',
    'Already comfortable reading error messages and fixing syntax errors from class exercises',
    'Prefers hands-on practice over theory',
  ],
  maxTurns: 4,
  teacherModelId: DEFAULT_ABLATION_TUTOR_MODEL_ID,
  studentModelId: 'google/gemini-2.5-flash-lite',
  judgeModelId: 'anthropic/claude-haiku-4.5',
  studentPersona:
    'Curious new coder who makes common syntax mistakes but is eager to understand why errors occur.',
  successCriteria:
    'Student can read error messages, identify off-by-one errors, and trace variable values through simple loops.',

  planStructure: {
    goal: 'Master Python debugging basics',
    nodes: [
      {
        id: 'error-messages',
        name: 'Reading Error Messages',
        description: 'Understanding Python tracebacks and error types',
        objectives: ['Identify error type from traceback', 'Locate line number of error'],
        prerequisites: [],
        estimatedMinutes: 10,
      },
      {
        id: 'syntax-errors',
        name: 'Syntax Errors',
        description: 'Common syntax mistakes: missing colons, parentheses, quotes',
        objectives: ['Spot missing syntax elements', 'Fix indentation errors'],
        prerequisites: ['error-messages'],
        estimatedMinutes: 10,
      },
      {
        id: 'logic-errors',
        name: 'Logic Errors',
        description: "Bugs that don't cause crashes but produce wrong results",
        objectives: ['Identify off-by-one errors', 'Trace variable values'],
        prerequisites: ['syntax-errors'],
        estimatedMinutes: 15,
      },
      {
        id: 'print-debugging',
        name: 'Print Debugging',
        description: 'Using print statements to trace program execution',
        objectives: ['Insert diagnostic prints', 'Interpret output to find bugs'],
        prerequisites: ['logic-errors'],
        estimatedMinutes: 10,
      },
    ],
  },

  preTestQuestions: [
    {
      id: 'pre_1',
      question: 'What does "SyntaxError: invalid syntax" typically indicate?',
      options: [
        'A logical error in the code',
        'A typo or missing punctuation',
        "A variable that doesn't exist",
        'Division by zero',
      ],
      correctIndex: 1,
      topicId: 'error-messages',
      difficulty: 'easy',
    },
    {
      id: 'pre_2',
      question: 'Which line has a syntax error?\n1: for i in range(5)\n2:     print(i)',
      options: ['Line 1 (missing colon)', 'Line 2 (wrong indentation)', 'Both lines', 'No error'],
      correctIndex: 0,
      topicId: 'syntax-errors',
      difficulty: 'easy',
    },
    {
      id: 'pre_3',
      question: 'What does range(1, 5) produce?',
      options: ['[1, 2, 3, 4, 5]', '[1, 2, 3, 4]', '[0, 1, 2, 3, 4]', '[0, 1, 2, 3, 4, 5]'],
      correctIndex: 1,
      topicId: 'logic-errors',
      difficulty: 'medium',
    },
    {
      id: 'pre_4',
      question: 'If a loop should run 5 times but runs 4 times, what is this bug called?',
      options: ['Syntax error', 'Off-by-one error', 'Type error', 'Name error'],
      correctIndex: 1,
      topicId: 'logic-errors',
      difficulty: 'medium',
    },
    {
      id: 'pre_5',
      question: 'What is the purpose of adding print(x) inside a loop?',
      options: [
        'To make the code run faster',
        'To see the value of x at each iteration',
        'To fix syntax errors',
        'To create a new variable',
      ],
      correctIndex: 1,
      topicId: 'print-debugging',
      difficulty: 'easy',
    },
  ],

  postTestQuestions: [
    {
      id: 'post_1',
      question: 'What does "NameError: name \'x\' is not defined" mean?',
      options: [
        'x has the wrong value',
        'x was never created or is misspelled',
        'x is the wrong type',
        'The syntax is incorrect',
      ],
      correctIndex: 1,
      topicId: 'error-messages',
      difficulty: 'easy',
    },
    {
      id: 'post_2',
      question: 'Which line has a syntax error?\n1: if x == 5:\n2: print("five")',
      options: [
        'Line 1 (missing parentheses)',
        'Line 2 (wrong indentation)',
        'Both lines',
        'No error',
      ],
      correctIndex: 1,
      topicId: 'syntax-errors',
      difficulty: 'easy',
    },
    {
      id: 'post_3',
      question: 'What does range(0, 4) produce?',
      options: ['[0, 1, 2, 3, 4]', '[0, 1, 2, 3]', '[1, 2, 3, 4]', '[1, 2, 3]'],
      correctIndex: 1,
      topicId: 'logic-errors',
      difficulty: 'medium',
    },
    {
      id: 'post_4',
      question: 'A function should return items at indices 0-4 but returns 0-3. This is:',
      options: ['A syntax error', 'An off-by-one error', 'A type error', 'A name error'],
      correctIndex: 1,
      topicId: 'logic-errors',
      difficulty: 'medium',
    },
    {
      id: 'post_5',
      question: 'Why add print("entering function") at the start of a function?',
      options: [
        'To speed up execution',
        'To confirm the function was called',
        'To fix the return value',
        'To declare variables',
      ],
      correctIndex: 1,
      topicId: 'print-debugging',
      difficulty: 'easy',
    },
  ],

  // Knowledge gaps: Student struggles with logic errors (target pre-test: ~60%)
  knowledgeGaps: [
    {
      topicId: 'logic-errors',
      errorRate: 0.8,
      misconception: 'Thinks range(1, 5) produces [1, 2, 3, 4, 5] including the end value',
      misconceptionDistractor: 0, // post_3: [0, 1, 2, 3, 4] (includes end value)
      evidenceKeywords: ['logic error', 'off-by-one', 'range', 'wrong result', 'wrong output'],
    },
    {
      topicId: 'print-debugging',
      errorRate: 0.5,
      misconception: 'Not sure when print debugging is useful vs other approaches',
      misconceptionDistractor: 0, // post_5: "To speed up execution" (wrong purpose)
      evidenceKeywords: ['print', 'debugging', 'trace', 'diagnostic', 'inspect'],
    },
  ],
};

// ============================================================================
// SCENARIO 4: Bayes' Rule (Intermediate Statistics)
// ============================================================================
const bayesRuleScenario: AblationScenario = {
  id: 'bayes_rule',
  title: "Statistics: Conditional Probability and Bayes' Rule",
  topic: 'Conditional probability and Bayesian reasoning',
  level: 'intermediate',
  goal: "Apply Bayes' rule to medical test and real-world scenarios",
  constraints: [
    'Overconfident learner who tends to rush through problems',
    "Stats final tomorrow has a dedicated section on Bayes' rule applications in medical/diagnostic testing — basic probability is not on the exam",
    'Took a probability course last semester and considers basic probability review unnecessary',
    'Strong intuitions about probability that are often wrong (e.g., base rate neglect)',
  ],
  maxTurns: 5,
  teacherModelId: DEFAULT_ABLATION_TUTOR_MODEL_ID,
  studentModelId: 'google/gemini-2.5-flash-lite',
  judgeModelId: 'anthropic/claude-haiku-4.5',
  studentPersona:
    'Overconfident learner who answers quickly and sometimes skips justification, but is receptive to gentle correction.',
  successCriteria:
    'Student correctly computes posterior probability in a medical test scenario and can explain why base rates matter.',

  planStructure: {
    goal: "Master Bayes' Rule application",
    nodes: [
      {
        id: 'basic-probability',
        name: 'Basic Probability Review',
        description: 'Events, P(A), P(A and B), independent events',
        objectives: [
          'Calculate simple probabilities',
          'Distinguish independent vs dependent events',
        ],
        prerequisites: [],
        estimatedMinutes: 10,
      },
      {
        id: 'conditional-probability',
        name: 'Conditional Probability',
        description: 'P(A|B) = P(A and B) / P(B)',
        objectives: ['Compute conditional probability', 'Interpret "given that" correctly'],
        prerequisites: ['basic-probability'],
        estimatedMinutes: 15,
      },
      {
        id: 'base-rate',
        name: 'Base Rate and Prior',
        description: 'Understanding prevalence and prior probability',
        objectives: ['Identify base rate in problems', 'Explain why base rate matters'],
        prerequisites: ['conditional-probability'],
        estimatedMinutes: 10,
      },
      {
        id: 'bayes-formula',
        name: "Bayes' Rule Formula",
        description: 'P(A|B) = P(B|A)·P(A) / P(B)',
        objectives: ["State Bayes' formula", 'Identify each component in context'],
        prerequisites: ['base-rate'],
        estimatedMinutes: 15,
      },
      {
        id: 'medical-application',
        name: 'Medical Test Application',
        description: "Applying Bayes' rule to diagnostic testing",
        objectives: ['Calculate positive predictive value', 'Explain false positive paradox'],
        prerequisites: ['bayes-formula'],
        estimatedMinutes: 20,
      },
    ],
  },

  preTestQuestions: [
    {
      id: 'pre_1',
      question: 'If you flip a fair coin twice, what is P(two heads)?',
      options: ['1/2', '1/4', '1/3', '1/8'],
      correctIndex: 1,
      topicId: 'basic-probability',
      difficulty: 'easy',
    },
    {
      id: 'pre_2',
      question: 'P(A|B) means:',
      options: [
        'Probability of A or B',
        'Probability of A given B occurred',
        'Probability of A and B',
        'Probability of A times B',
      ],
      correctIndex: 1,
      topicId: 'conditional-probability',
      difficulty: 'easy',
    },
    {
      id: 'pre_3',
      question: 'A disease affects 1% of the population. This 1% is called:',
      options: ['The likelihood', 'The posterior', 'The base rate/prior', 'The conditional'],
      correctIndex: 2,
      topicId: 'base-rate',
      difficulty: 'medium',
    },
    {
      id: 'pre_4',
      question: "In Bayes' formula P(A|B) = P(B|A)·P(A)/P(B), what is P(A)?",
      options: ['Likelihood', 'Prior probability of A', 'Posterior probability', 'Evidence'],
      correctIndex: 1,
      topicId: 'bayes-formula',
      difficulty: 'medium',
    },
    {
      id: 'pre_5',
      question:
        'A test is 99% accurate and the disease prevalence is 1%. If you test positive, is it more likely you have the disease or not?',
      options: [
        'Definitely have it (99% accurate)',
        'About 50-50',
        'More likely false positive',
        'Cannot determine',
      ],
      correctIndex: 1,
      topicId: 'medical-application',
      difficulty: 'hard',
    },
  ],

  postTestQuestions: [
    {
      id: 'post_1',
      question: 'If you roll a fair die, what is P(even number)?',
      options: ['1/6', '1/3', '1/2', '2/3'],
      correctIndex: 2,
      topicId: 'basic-probability',
      difficulty: 'easy',
    },
    {
      id: 'post_2',
      question: 'P(rain|cloudy) represents:',
      options: [
        'Probability of clouds when it rains',
        'Probability of rain when it is cloudy',
        'Probability of rain and clouds',
        'Probability of rain or clouds',
      ],
      correctIndex: 1,
      topicId: 'conditional-probability',
      difficulty: 'easy',
    },
    {
      id: 'post_3',
      question: '5% of emails are spam. This 5% is the:',
      options: [
        'Likelihood of spam',
        'Posterior probability',
        'Prior/base rate of spam',
        'False positive rate',
      ],
      correctIndex: 2,
      topicId: 'base-rate',
      difficulty: 'medium',
    },
    {
      id: 'post_4',
      question: "In Bayes' formula, P(B|A) is called the:",
      options: ['Prior', 'Posterior', 'Likelihood', 'Evidence'],
      correctIndex: 2,
      topicId: 'bayes-formula',
      difficulty: 'medium',
    },
    {
      id: 'post_5',
      question:
        'A cancer screening has 95% sensitivity and 90% specificity. If cancer prevalence is 0.5%, should a positive result cause immediate concern?',
      options: [
        'Yes, 95% sensitive means 95% chance of cancer',
        'No, most positives are false positives due to low prevalence',
        'Yes, because specificity is high',
        'Cannot determine without more info',
      ],
      correctIndex: 1,
      topicId: 'medical-application',
      difficulty: 'hard',
    },
  ],

  // Knowledge gaps: Student falls for classic base rate neglect (target pre-test: ~40%)
  knowledgeGaps: [
    {
      topicId: 'base-rate',
      errorRate: 0.7,
      misconception: 'Ignores base rate when evaluating test results',
      misconceptionDistractor: 0, // post_3: "Likelihood of spam" (confuses with base rate)
      evidenceKeywords: ['base rate', 'prevalence', 'prior probability', 'population rate'],
    },
    {
      topicId: 'bayes-formula',
      errorRate: 0.8,
      misconception: "Confuses P(A|B) with P(B|A) - the prosecutor's fallacy",
      misconceptionDistractor: 1, // post_4: "Posterior" (confuses likelihood with posterior)
      evidenceKeywords: ['bayes', 'likelihood', 'P(B|A)', 'posterior', 'formula'],
    },
    {
      topicId: 'medical-application',
      errorRate: 0.9,
      misconception:
        'Thinks high test accuracy means high probability of disease given positive test',
      misconceptionDistractor: 0, // post_5: "Yes, 95% sensitive means 95% chance" (base rate neglect)
      evidenceKeywords: [
        'false positive',
        'sensitivity',
        'specificity',
        'screening',
        'medical test',
      ],
    },
  ],
};

// ============================================================================
// EXPORTED SCENARIOS
// ============================================================================

export const ABLATION_SCENARIOS: AblationScenario[] = [
  linearEquationsScenario,
  derivativesScenario,
  pythonDebuggingScenario,
  bayesRuleScenario,
];

export function getScenarioById(id: string): AblationScenario | undefined {
  return ABLATION_SCENARIOS.find((s) => s.id === id);
}
