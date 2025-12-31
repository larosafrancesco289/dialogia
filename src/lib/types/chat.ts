import type { LearningPlan } from '@/lib/types/learningPlan';
import type { LearnerModel, TutorResearchMode, TutorToolBudget } from '@/lib/types/tutor';

export type ChatSettings = {
  model: string;
  parallel_models?: string[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  system?: string;
  // OpenRouter reasoning controls (for thinking models)
  reasoning_effort?: 'none' | 'low' | 'medium' | 'high';
  reasoning_tokens?: number; // max reasoning tokens (optional)
  show_thinking_by_default?: boolean; // UI preference only
  show_stats?: boolean; // UI preference only
  // Optional web search augmentation (provider controlled separately)
  search_enabled?: boolean;
  // Web search provider selection (defaults to 'brave' for backward compatibility)
  search_provider?: 'brave' | 'openrouter';
  // Tutor mode: enables pedagogy prompt + tutor tools
  tutor_mode?: boolean;
  tutor_default_model?: string;
  tutor_thesis_mode?: boolean;
  tutor_research_mode?: TutorResearchMode;
  tutor_tool_budget?: TutorToolBudget;
  // Learning Plan System
  learningPlan?: LearningPlan;
  planGenerated?: boolean; // Flag to track if plan was generated
  planGenerationModel?: string; // Model used to generate plan
  showToolCallLog?: boolean; // Display tool call log under assistant messages
  showDebugRawJson?: boolean; // Toggle raw request payload in debug panel
  // Learner Model Tracking
  enableLearnerModel?: boolean; // Whether to track mastery
  learnerModel?: LearnerModel; // Persisted learner model (mastery data)
};

export type Chat = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  settings: ChatSettings;
  folderId?: string; // Optional folder association
};

export type Folder = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  isExpanded: boolean;
  parentId?: string; // Optional for nested folders
};
