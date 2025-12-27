import type { LearningPlan } from '@/lib/types/learningPlan';

export type TutorResearchMode = 'baseline_chat' | 'plan_only' | 'model_only' | 'plan_plus_model';

export type TutorToolBudget = {
  maxToolsPerTurn?: number;
  maxQuizzesPerNode?: number;
  maxDiagnosticsPerSession?: number;
};

// Tutor tool item types rendered by UI (ephemeral; stored in UI state)
export type TutorMCQItem = {
  id: string;
  question: string;
  choices: string[];
  correct: number; // index into choices
  explanation?: string;
  topic?: string;
  skill?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
};

export type TutorFillBlankItem = {
  id: string;
  prompt: string; // contains the blank (e.g., "____")
  answer: string;
  aliases?: string[]; // alternative accepted answers
  explanation?: string;
  topic?: string;
  skill?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
};

export type TutorOpenItem = {
  id: string;
  prompt: string;
  sample_answer?: string;
  rubric?: string;
  topic?: string;
  skill?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
};

export type TutorFlashcardItem = {
  id: string;
  front: string;
  back: string;
  hint?: string;
  topic?: string;
  skill?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
};

export type TutorQuestionnaireOption = {
  label: string;
  description?: string;
};

export type TutorQuestionnaireItem = {
  id: string;
  question: string;
  category?: string;
  allowMultiple?: boolean;
  followUpBehavior?: 'required' | 'optional' | 'none';
  options: TutorQuestionnaireOption[];
};

export type TutorQuestionnaire = {
  questions: TutorQuestionnaireItem[];
  status: 'awaiting' | 'submitted';
  submittedAt?: number;
  responses?: Record<string, string[]>;
};

export type TutorDiagnosticItem = {
  id: string;
  question: string;
  choices: string[];
  correct?: number;
  explanation?: string;
  skill?: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced' | 'mixed' | 'easy' | 'medium' | 'hard';
};

export type TutorDiagnostic = {
  diagnosticId: string;
  topic: string;
  depth: 'quick' | 'moderate' | 'comprehensive';
  items: TutorDiagnosticItem[];
  adaptToAnswers?: boolean;
  interpretation?: Record<string, string>;
  status: 'pending' | 'completed';
  score?: number;
};

export type TutorPlanProposal = {
  plan: LearningPlan;
  requiresConfirmation?: boolean;
  confirmationMessage?: string;
  status: 'pending' | 'approved' | 'declined';
  requestedAt: number;
  resolvedAt?: number;
};

export type TutorPlanSuggestion = {
  action: string;
  priority?: 'low' | 'medium' | 'high';
  description?: string;
  rationale?: string;
  estimatedImpact?: string;
  implementationDetails?: Record<string, unknown>;
};

export type TutorAssessmentEvidence = {
  question: string;
  studentAnswer: string;
  correctAnswer?: string;
  questionType?: 'mcq' | 'fill-blank' | 'open-ended' | 'explanation' | 'application';
  skill?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  result: 'correct' | 'incorrect' | 'partial';
  hintsUsed?: number;
  feedback?: string;
};

export type TutorLearnerModelUpdate = {
  nodeId: string;
  confidenceBefore?: number;
  confidenceAfter?: number;
  masteryLevel?: string;
  evidence?: TutorAssessmentEvidence[];
  tutorComment?: string;
};

// Persisted tutor payload attached to an assistant message
export type MessageTutor = {
  title?: string;
  mcq?: TutorMCQItem[];
  fillBlank?: TutorFillBlankItem[];
  openEnded?: TutorOpenItem[];
  flashcards?: TutorFlashcardItem[];
  questionnaire?: TutorQuestionnaire;
  diagnostic?: TutorDiagnostic;
  diagnosticMeta?: {
    completedAt?: Record<string, number>;
  };
  planProposal?: TutorPlanProposal;
  planSuggestions?: TutorPlanSuggestion[];
  assessmentUpdates?: TutorLearnerModelUpdate[];
  // User attempts and grading results
  attempts?: {
    mcq?: Record<string, { choice?: number; done?: boolean; correct?: boolean }>;
    fillBlank?: Record<string, { answer?: string; revealed?: boolean; correct?: boolean }>;
    open?: Record<string, { answer?: string }>;
  };
  grading?: Record<string, { score?: number; feedback: string; criteria?: string[] }>;
};

// Tutor session and grading metadata (ephemeral; UI/agent coordination only)
export type TutorSession = {
  goal?: string;
  duration_min?: number;
  stage?: 'baseline' | 'teach' | 'practice' | 'reflect' | 'review';
  focus?: string;
  next?: string;
  skills?: string[];
};

export type TutorRecommendation = {
  reason?: string;
  recommendation?: 'more_practice' | 'harder' | 'easier' | 'review_mistakes' | 'new_concept';
};

export type TutorGradingResult = {
  score?: number; // 0..1 normalized or percentage scaled later
  feedback: string;
  criteria?: string[];
};

export type TutorProfile = {
  chatId: string;
  updatedAt: number;
  totalAnswered: number;
  totalCorrect: number;
  topics?: Record<string, { correct: number; wrong: number }>;
  skills?: Record<string, { correct: number; wrong: number }>;
  difficulty?: Record<'easy' | 'medium' | 'hard', { correct: number; wrong: number }>;
};

export type TutorEvent = {
  kind: 'mcq' | 'fill_blank' | 'open' | 'flashcard';
  itemId?: string;
  correct?: boolean;
  topic?: string;
  skill?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
};

// Learner Model Types
export type LearnerModel = {
  studentId?: string; // Optional user ID (currently unused)
  chatId: string; // Associated chat
  updatedAt: number; // Last update timestamp
  version: number; // Schema version
  mastery: Record<string, TopicMastery>; // Keyed by node ID from LearningPlan
  globalMetrics?: {
    totalInteractions: number;
    accuracyRate: number; // Overall correctness
    averageConfidence: number; // Avg mastery across topics
  };
};

export type LearnerModelDebugSnapshot = {
  nodeId: string;
  nodeName?: string;
  evidenceType?: Evidence['type'];
  weight?: number;
  oldConfidence?: number;
  newConfidence?: number;
  note?: string;
};

export type TopicMastery = {
  nodeId: string; // Reference to LearningPlanNode
  confidence: number; // 0.0 - 1.0 (mastery estimate)
  interactions: number; // Number of interactions on this topic
  lastInteraction: number; // Timestamp
  evidence: Evidence[]; // Supporting evidence for mastery estimate
  misconceptions: Misconception[]; // Identified errors
  needsReview?: boolean; // Flag for spaced repetition
};

export type Evidence = {
  timestamp: number;
  type:
    | 'correct_answer'
    | 'incorrect_answer'
    | 'partial_answer'
    | 'hint_needed'
    | 'explanation_requested'
    | 'misconception_detected'
    | 'insight_demonstrated';
  details: string; // Description of what happened
  weight: number; // 0.0 - 1.0 (how much this updates mastery)
  skill?: string;
};

export type Misconception = {
  id: string;
  description: string; // "Confuses power rule exponent order"
  firstObserved: number;
  occurrences: number;
  resolved: boolean;
  severity?: string;
  examples?: string[];
};
