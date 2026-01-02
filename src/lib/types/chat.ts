import type { ProviderSort } from '@/lib/models/providerSort';
import type { LearningPlan } from '@/lib/types/learningPlan';
import type { LearnerModel, TutorResearchMode, TutorToolBudget } from '@/lib/types/tutor';

export type SearchProvider = 'brave' | 'openrouter';

export type GenerationSettings = {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
  reasoningTokens?: number;
  providerSort?: ProviderSort;
};

export type ChatUiSettings = {
  showThinkingByDefault: boolean;
  showStats: boolean;
  showToolCallLog: boolean;
  showDebugRawJson: boolean;
};

export type ChatSearchSettings = {
  enabled: boolean;
  provider: SearchProvider;
};

export type TutorSettings = {
  enabled: boolean;
  defaultModelId?: string;
  thesisMode?: boolean;
  researchMode?: TutorResearchMode;
  toolBudget?: TutorToolBudget;
  learningPlan?: LearningPlan;
  planGenerated?: boolean;
  planGenerationModel?: string;
  enableLearnerModel?: boolean;
  learnerModel?: LearnerModel;
};

export type ChatFeatures = {
  search: ChatSearchSettings;
  tutor: TutorSettings;
};

export type ChatSettings = {
  modelId: string;
  parallelModels?: string[];
  system?: string;
  generation: GenerationSettings;
  ui: ChatUiSettings;
  features: ChatFeatures;
};

export type ChatSettingsPatch = {
  modelId?: string;
  parallelModels?: string[];
  system?: string;
  generation?: Partial<GenerationSettings>;
  ui?: Partial<ChatUiSettings>;
  features?: {
    search?: Partial<ChatSearchSettings>;
    tutor?: Partial<TutorSettings>;
  };
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
