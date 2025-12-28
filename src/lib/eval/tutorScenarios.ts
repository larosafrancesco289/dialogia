import 'server-only';
export type TutorScenario = {
  id: string;
  title: string;
  topic: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  goal: string;
  constraints?: string[];
  maxTurns: number;
  teacherModelId: string;
  studentModelId: string;
  judgeModelId: string;
  studentPersona: string;
  successCriteria: string;
};

export const defaultTutorScenarios: TutorScenario[] = [
  {
    id: 'algebra_intake',
    title: 'Algebra Baseline',
    topic: 'Solving linear equations',
    level: 'beginner',
    goal: 'Prepare for an algebra quiz on solving for x with one variable.',
    constraints: ['Exam in 3 days', 'Nervous about word problems'],
    maxTurns: 5,
    teacherModelId: 'x-ai/grok-4.1-fast',
    studentModelId: 'x-ai/grok-4.1-fast',
    judgeModelId: 'x-ai/grok-4.1-fast',
    studentPersona:
      'Anxious high-schooler who second-guesses answers and prefers guided steps before trying alone.',
    successCriteria:
      'Student should demonstrate correct steps for isolating the variable and handle at least one word problem variant.',
  },
  {
    id: 'probability_practice',
    title: 'Conditional Probability',
    topic: "Conditional probability and Bayes' rule",
    level: 'intermediate',
    goal: "Refresh conditional probability intuition and apply Bayes' rule to a medical test scenario.",
    constraints: ['Student rushes and occasionally overestimates confidence'],
    maxTurns: 6,
    teacherModelId: 'x-ai/grok-4.1-fast',
    studentModelId: 'x-ai/grok-4.1-fast',
    judgeModelId: 'x-ai/grok-4.1-fast',
    studentPersona:
      'Overconfident learner who answers quickly, sometimes skipping justification, but is receptive to gentle correction.',
    successCriteria:
      'Student should correctly compute posterior probability in a simple test example and explain the reasoning steps.',
  },
  {
    id: 'intro_programming',
    title: 'Debugging Basics',
    topic: 'Intro programming debugging',
    level: 'beginner',
    goal: 'Learn to debug a simple function that sums numbers in a list.',
    constraints: ['Prefers hands-on exercises', 'Limited time today (15 minutes)'],
    maxTurns: 5,
    teacherModelId: 'x-ai/grok-4.1-fast',
    studentModelId: 'x-ai/grok-4.1-fast',
    judgeModelId: 'x-ai/grok-4.1-fast',
    studentPersona:
      'Curious new coder who asks clarifying questions, occasionally makes syntax mistakes, and appreciates encouragement.',
    successCriteria:
      'Student should identify the bug in the summing function, propose a fix, and demonstrate understanding of loop logic.',
  },
];
