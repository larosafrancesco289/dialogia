// Learning Plan System Types
export type LearningPlan = {
  goal: string; // "Master calculus derivatives"
  generatedAt: number; // Unix timestamp
  updatedAt: number; // Last modification time
  version: number; // Schema version (for migrations)
  nodes: LearningPlanNode[]; // Tree structure
  metadata?: {
    estimatedHours?: number;
    difficulty?: 'beginner' | 'intermediate' | 'advanced';
    prerequisites?: string[]; // External prerequisites (e.g., "algebra")
  };
};

export type LearningPlanNode = {
  id: string; // Unique node ID (e.g., "limits", "chain_rule")
  name: string; // Display name ("Limit Concept")
  description?: string; // Detailed description
  objectives: string[]; // Learning objectives (verifiable outcomes)
  prerequisites: string[]; // Node IDs that must be completed first
  status: 'not_started' | 'in_progress' | 'completed';
  startedAt?: number; // When first worked on
  completedAt?: number; // When marked complete
  estimatedMinutes?: number; // Time estimate
  resources?: {
    // Optional learning materials
    type: 'reading' | 'video' | 'practice';
    title: string;
    url?: string;
  }[];
  children?: string[]; // Child node IDs (for hierarchical plans)
};
