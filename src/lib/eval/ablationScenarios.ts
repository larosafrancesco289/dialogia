import type { TutorScenario } from '@/lib/eval/tutorScenarios';
import type { LearningPlan, LearningPlanNode } from '@/lib/types';

/**
 * MCQ question for pre/post testing.
 */
export type TestQuestion = {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  topicId: string; // Maps to a node in the learning plan DAG
  difficulty: 'easy' | 'medium' | 'hard';
};

/**
 * Knowledge gap definition for simulating realistic student knowledge.
 * Used to calibrate pre-test scores so learning gains can be measured.
 */
export type KnowledgeGap = {
  topicId: string;
  misconception?: string; // What the student wrongly believes
  errorRate: number; // 0-1, probability of answering incorrectly
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
  postTestQuestions: TestQuestion[]; // Isomorphic to pre-test
  knowledgeGaps: KnowledgeGap[]; // Topics the student doesn't know initially
};

/**
 * Generate a learning plan from scenario's plan structure.
 */
export function generatePlanFromScenario(scenario: AblationScenario): LearningPlan {
  return {
    goal: scenario.planStructure.goal,
    generatedAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
    nodes: scenario.planStructure.nodes.map((node) => ({
      ...node,
      status: 'not_started' as const,
    })),
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
  constraints: ['High school student', 'Exam in 3 days', 'Nervous about word problems'],
  maxTurns: 6,
  teacherModelId: 'anthropic/claude-haiku-4.5',
  studentModelId: 'x-ai/grok-4.1-fast',
  judgeModelId: 'x-ai/grok-4.1-fast',
  studentPersona:
    'Anxious high-schooler who second-guesses answers and prefers step-by-step guidance before trying alone.',
  successCriteria:
    'Student correctly solves equations with variables on one side, handles negative coefficients, and can set up a simple word problem.',

  planStructure: {
    goal: 'Master solving linear equations',
    nodes: [
      {
        id: 'inverse_operations',
        name: 'Inverse Operations',
        description:
          'Understanding addition/subtraction and multiplication/division as inverse operations',
        objectives: ['Identify inverse operations', 'Apply to isolate terms'],
        prerequisites: [],
        estimatedMinutes: 10,
      },
      {
        id: 'one_step',
        name: 'One-Step Equations',
        description: 'Solving equations like x + 5 = 12 or 3x = 15',
        objectives: [
          'Solve addition/subtraction equations',
          'Solve multiplication/division equations',
        ],
        prerequisites: ['inverse_operations'],
        estimatedMinutes: 15,
      },
      {
        id: 'two_step',
        name: 'Two-Step Equations',
        description: 'Solving equations like 2x + 3 = 11',
        objectives: ['Apply operations in correct order', 'Check solutions'],
        prerequisites: ['one_step'],
        estimatedMinutes: 15,
      },
      {
        id: 'word_problems',
        name: 'Word Problems',
        description: 'Translating word problems into equations',
        objectives: [
          'Identify unknown variable',
          'Set up equation from context',
          'Solve and interpret',
        ],
        prerequisites: ['two_step'],
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
      topicId: 'inverse_operations',
      difficulty: 'easy',
    },
    {
      id: 'pre_2',
      question: 'Solve for x: x + 7 = 12',
      options: ['x = 19', 'x = 5', 'x = -5', 'x = 7'],
      correctIndex: 1,
      topicId: 'one_step',
      difficulty: 'easy',
    },
    {
      id: 'pre_3',
      question: 'Solve for x: 4x = 20',
      options: ['x = 80', 'x = 16', 'x = 5', 'x = 24'],
      correctIndex: 2,
      topicId: 'one_step',
      difficulty: 'easy',
    },
    {
      id: 'pre_4',
      question: 'Solve for x: 3x + 4 = 19',
      options: ['x = 5', 'x = 7.67', 'x = 15', 'x = 23'],
      correctIndex: 0,
      topicId: 'two_step',
      difficulty: 'medium',
    },
    {
      id: 'pre_5',
      question: 'A number doubled and increased by 6 equals 20. What equation represents this?',
      options: ['2x + 6 = 20', 'x + 6 = 20', '2(x + 6) = 20', '6x + 2 = 20'],
      correctIndex: 0,
      topicId: 'word_problems',
      difficulty: 'medium',
    },
  ],

  postTestQuestions: [
    {
      id: 'post_1',
      question: 'What is the inverse operation of multiplication?',
      options: ['Addition', 'Subtraction', 'Division', 'Squaring'],
      correctIndex: 2,
      topicId: 'inverse_operations',
      difficulty: 'easy',
    },
    {
      id: 'post_2',
      question: 'Solve for y: y - 9 = 15',
      options: ['y = 6', 'y = 24', 'y = -6', 'y = 135'],
      correctIndex: 1,
      topicId: 'one_step',
      difficulty: 'easy',
    },
    {
      id: 'post_3',
      question: 'Solve for y: 6y = 42',
      options: ['y = 252', 'y = 36', 'y = 7', 'y = 48'],
      correctIndex: 2,
      topicId: 'one_step',
      difficulty: 'easy',
    },
    {
      id: 'post_4',
      question: 'Solve for y: 5y - 3 = 22',
      options: ['y = 5', 'y = 3.8', 'y = 25', 'y = 19'],
      correctIndex: 0,
      topicId: 'two_step',
      difficulty: 'medium',
    },
    {
      id: 'post_5',
      question: 'Three times a number minus 8 equals 16. What equation represents this?',
      options: ['3x - 8 = 16', 'x - 8 = 16', '3(x - 8) = 16', '8x - 3 = 16'],
      correctIndex: 0,
      topicId: 'word_problems',
      difficulty: 'medium',
    },
  ],

  // Knowledge gaps: Student struggles with multi-step and word problems (target pre-test: ~60%)
  knowledgeGaps: [
    {
      topicId: 'two_step',
      errorRate: 0.8,
      misconception: 'Often applies operations in wrong order (divides before subtracting)',
    },
    {
      topicId: 'word_problems',
      errorRate: 0.9,
      misconception: 'Confuses "doubled and increased by" with "increased then doubled"',
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
  constraints: ['College freshman', 'Preparing for midterm', 'Weak algebra foundation'],
  maxTurns: 8,
  teacherModelId: 'anthropic/claude-haiku-4.5',
  studentModelId: 'x-ai/grok-4.1-fast',
  judgeModelId: 'x-ai/grok-4.1-fast',
  studentPersona:
    'College freshman who struggles with abstraction but excels with worked examples and visual intuition.',
  successCriteria:
    'Student correctly differentiates polynomials using power, constant, and sum rules, and can explain the limit definition conceptually.',

  planStructure: {
    goal: 'Master basic differentiation',
    nodes: [
      {
        id: 'limit_definition',
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
        id: 'power_rule',
        name: 'Power Rule',
        description: 'd/dx[x^n] = nx^(n-1)',
        objectives: ['Apply power rule to monomials', 'Handle negative and fractional exponents'],
        prerequisites: ['limit_definition'],
        estimatedMinutes: 15,
      },
      {
        id: 'constant_rule',
        name: 'Constant Rule',
        description: "d/dx[c] = 0 and d/dx[cf(x)] = c·f'(x)",
        objectives: ['Differentiate constants', 'Factor out constant multipliers'],
        prerequisites: ['limit_definition'],
        estimatedMinutes: 10,
      },
      {
        id: 'sum_rule',
        name: 'Sum and Difference Rule',
        description: "d/dx[f(x) ± g(x)] = f'(x) ± g'(x)",
        objectives: ['Differentiate term by term', 'Combine with power and constant rules'],
        prerequisites: ['power_rule', 'constant_rule'],
        estimatedMinutes: 15,
      },
      {
        id: 'polynomial_practice',
        name: 'Polynomial Differentiation',
        description: 'Combining all rules for polynomial functions',
        objectives: ['Differentiate any polynomial', 'Find tangent line equations'],
        prerequisites: ['sum_rule'],
        estimatedMinutes: 20,
      },
      {
        id: 'applications',
        name: 'Applications: Rates of Change',
        description: 'Interpreting derivatives as instantaneous rate of change',
        objectives: ['Compute velocity from position', 'Interpret derivative in context'],
        prerequisites: ['polynomial_practice'],
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
      topicId: 'limit_definition',
      difficulty: 'easy',
    },
    {
      id: 'pre_2',
      question: 'What is the derivative of f(x) = x³?',
      options: ['3x²', 'x²', '3x³', 'x⁴/4'],
      correctIndex: 0,
      topicId: 'power_rule',
      difficulty: 'easy',
    },
    {
      id: 'pre_3',
      question: 'What is the derivative of f(x) = 7?',
      options: ['7', '1', '0', '7x'],
      correctIndex: 2,
      topicId: 'constant_rule',
      difficulty: 'easy',
    },
    {
      id: 'pre_4',
      question: 'What is the derivative of f(x) = x² + 3x - 1?',
      options: ['2x + 3', 'x² + 3', '2x + 3x', '2x² + 3'],
      correctIndex: 0,
      topicId: 'sum_rule',
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
      topicId: 'limit_definition',
      difficulty: 'easy',
    },
    {
      id: 'post_2',
      question: 'What is the derivative of g(x) = x⁵?',
      options: ['5x⁴', 'x⁴', '5x⁵', 'x⁶/6'],
      correctIndex: 0,
      topicId: 'power_rule',
      difficulty: 'easy',
    },
    {
      id: 'post_3',
      question: 'What is the derivative of g(x) = -3?',
      options: ['-3', '-1', '0', '3x'],
      correctIndex: 2,
      topicId: 'constant_rule',
      difficulty: 'easy',
    },
    {
      id: 'post_4',
      question: 'What is the derivative of g(x) = 2x³ - 5x + 4?',
      options: ['6x² - 5', '2x³ - 5', '6x² - 5x', '2x² - 5'],
      correctIndex: 0,
      topicId: 'sum_rule',
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

  // Knowledge gaps: Student weak on conceptual and application topics (target pre-test: ~40%)
  knowledgeGaps: [
    {
      topicId: 'limit_definition',
      errorRate: 0.7,
      misconception: 'Confuses derivative with integral - thinks derivative finds area',
    },
    {
      topicId: 'sum_rule',
      errorRate: 0.8,
      misconception: 'Forgets to differentiate each term separately',
    },
    {
      topicId: 'applications',
      errorRate: 0.9,
      misconception: 'Confuses velocity (derivative) with position (original function)',
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
  constraints: ['New to programming', 'Limited time (15 min)', 'Prefers hands-on practice'],
  maxTurns: 5,
  teacherModelId: 'anthropic/claude-haiku-4.5',
  studentModelId: 'x-ai/grok-4.1-fast',
  judgeModelId: 'x-ai/grok-4.1-fast',
  studentPersona:
    'Curious new coder who makes common syntax mistakes but is eager to understand why errors occur.',
  successCriteria:
    'Student can read error messages, identify off-by-one errors, and trace variable values through simple loops.',

  planStructure: {
    goal: 'Master Python debugging basics',
    nodes: [
      {
        id: 'error_messages',
        name: 'Reading Error Messages',
        description: 'Understanding Python tracebacks and error types',
        objectives: ['Identify error type from traceback', 'Locate line number of error'],
        prerequisites: [],
        estimatedMinutes: 10,
      },
      {
        id: 'syntax_errors',
        name: 'Syntax Errors',
        description: 'Common syntax mistakes: missing colons, parentheses, quotes',
        objectives: ['Spot missing syntax elements', 'Fix indentation errors'],
        prerequisites: ['error_messages'],
        estimatedMinutes: 10,
      },
      {
        id: 'logic_errors',
        name: 'Logic Errors',
        description: "Bugs that don't cause crashes but produce wrong results",
        objectives: ['Identify off-by-one errors', 'Trace variable values'],
        prerequisites: ['syntax_errors'],
        estimatedMinutes: 15,
      },
      {
        id: 'print_debugging',
        name: 'Print Debugging',
        description: 'Using print statements to trace program execution',
        objectives: ['Insert diagnostic prints', 'Interpret output to find bugs'],
        prerequisites: ['logic_errors'],
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
      topicId: 'error_messages',
      difficulty: 'easy',
    },
    {
      id: 'pre_2',
      question: 'Which line has a syntax error?\n1: for i in range(5)\n2:     print(i)',
      options: ['Line 1 (missing colon)', 'Line 2 (wrong indentation)', 'Both lines', 'No error'],
      correctIndex: 0,
      topicId: 'syntax_errors',
      difficulty: 'easy',
    },
    {
      id: 'pre_3',
      question: 'What does range(1, 5) produce?',
      options: ['[1, 2, 3, 4, 5]', '[1, 2, 3, 4]', '[0, 1, 2, 3, 4]', '[0, 1, 2, 3, 4, 5]'],
      correctIndex: 1,
      topicId: 'logic_errors',
      difficulty: 'medium',
    },
    {
      id: 'pre_4',
      question: 'If a loop should run 5 times but runs 4 times, what is this bug called?',
      options: ['Syntax error', 'Off-by-one error', 'Type error', 'Name error'],
      correctIndex: 1,
      topicId: 'logic_errors',
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
      topicId: 'print_debugging',
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
      topicId: 'error_messages',
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
      topicId: 'syntax_errors',
      difficulty: 'easy',
    },
    {
      id: 'post_3',
      question: 'What does range(0, 4) produce?',
      options: ['[0, 1, 2, 3, 4]', '[0, 1, 2, 3]', '[1, 2, 3, 4]', '[1, 2, 3]'],
      correctIndex: 1,
      topicId: 'logic_errors',
      difficulty: 'medium',
    },
    {
      id: 'post_4',
      question: 'A function should return items at indices 0-4 but returns 0-3. This is:',
      options: ['A syntax error', 'An off-by-one error', 'A type error', 'A name error'],
      correctIndex: 1,
      topicId: 'logic_errors',
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
      topicId: 'print_debugging',
      difficulty: 'easy',
    },
  ],

  // Knowledge gaps: Student struggles with logic errors (target pre-test: ~60%)
  knowledgeGaps: [
    {
      topicId: 'logic_errors',
      errorRate: 0.8,
      misconception: 'Thinks range(1, 5) produces [1, 2, 3, 4, 5] including the end value',
    },
    {
      topicId: 'print_debugging',
      errorRate: 0.5,
      misconception: 'Not sure when print debugging is useful vs other approaches',
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
    'Overconfident learner',
    'Tends to rush through problems',
    'Strong intuitions that may be wrong',
  ],
  maxTurns: 7,
  teacherModelId: 'anthropic/claude-haiku-4.5',
  studentModelId: 'x-ai/grok-4.1-fast',
  judgeModelId: 'x-ai/grok-4.1-fast',
  studentPersona:
    'Overconfident learner who answers quickly and sometimes skips justification, but is receptive to gentle correction.',
  successCriteria:
    'Student correctly computes posterior probability in a medical test scenario and can explain why base rates matter.',

  planStructure: {
    goal: "Master Bayes' Rule application",
    nodes: [
      {
        id: 'basic_probability',
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
        id: 'conditional_probability',
        name: 'Conditional Probability',
        description: 'P(A|B) = P(A and B) / P(B)',
        objectives: ['Compute conditional probability', 'Interpret "given that" correctly'],
        prerequisites: ['basic_probability'],
        estimatedMinutes: 15,
      },
      {
        id: 'base_rate',
        name: 'Base Rate and Prior',
        description: 'Understanding prevalence and prior probability',
        objectives: ['Identify base rate in problems', 'Explain why base rate matters'],
        prerequisites: ['conditional_probability'],
        estimatedMinutes: 10,
      },
      {
        id: 'bayes_formula',
        name: "Bayes' Rule Formula",
        description: 'P(A|B) = P(B|A)·P(A) / P(B)',
        objectives: ["State Bayes' formula", 'Identify each component in context'],
        prerequisites: ['base_rate'],
        estimatedMinutes: 15,
      },
      {
        id: 'medical_application',
        name: 'Medical Test Application',
        description: "Applying Bayes' rule to diagnostic testing",
        objectives: ['Calculate positive predictive value', 'Explain false positive paradox'],
        prerequisites: ['bayes_formula'],
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
      topicId: 'basic_probability',
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
      topicId: 'conditional_probability',
      difficulty: 'easy',
    },
    {
      id: 'pre_3',
      question: 'A disease affects 1% of the population. This 1% is called:',
      options: ['The likelihood', 'The posterior', 'The base rate/prior', 'The conditional'],
      correctIndex: 2,
      topicId: 'base_rate',
      difficulty: 'medium',
    },
    {
      id: 'pre_4',
      question: "In Bayes' formula P(A|B) = P(B|A)·P(A)/P(B), what is P(A)?",
      options: ['Likelihood', 'Prior probability of A', 'Posterior probability', 'Evidence'],
      correctIndex: 1,
      topicId: 'bayes_formula',
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
      topicId: 'medical_application',
      difficulty: 'hard',
    },
  ],

  postTestQuestions: [
    {
      id: 'post_1',
      question: 'If you roll a fair die, what is P(even number)?',
      options: ['1/6', '1/3', '1/2', '2/3'],
      correctIndex: 2,
      topicId: 'basic_probability',
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
      topicId: 'conditional_probability',
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
      topicId: 'base_rate',
      difficulty: 'medium',
    },
    {
      id: 'post_4',
      question: "In Bayes' formula, P(B|A) is called the:",
      options: ['Prior', 'Posterior', 'Likelihood', 'Evidence'],
      correctIndex: 2,
      topicId: 'bayes_formula',
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
      topicId: 'medical_application',
      difficulty: 'hard',
    },
  ],

  // Knowledge gaps: Student falls for classic base rate neglect (target pre-test: ~40%)
  knowledgeGaps: [
    {
      topicId: 'base_rate',
      errorRate: 0.7,
      misconception: 'Ignores base rate when evaluating test results',
    },
    {
      topicId: 'bayes_formula',
      errorRate: 0.8,
      misconception: "Confuses P(A|B) with P(B|A) - the prosecutor's fallacy",
    },
    {
      topicId: 'medical_application',
      errorRate: 0.9,
      misconception:
        'Thinks high test accuracy means high probability of disease given positive test',
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
