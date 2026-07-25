import type { ProviderSort } from '@/lib/models/providerSort';
import type { LearningPlan } from '@/lib/types/learningPlan';
import type { LearnerModel, TutorToolBudget } from '@/lib/types/tutor';
import type { ReasoningEffort, SearchMode } from '@/lib/types/enums';
export type { ReasoningEffort, SearchMode } from '@/lib/types/enums';
export { NATIVE_SEARCH_MODE, ReasoningEffortEnum } from '@/lib/types/enums';

export type GenerationSettings = {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  reasoningEffort?: ReasoningEffort;
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
  provider: SearchMode;
};

export type TutorSettings = {
  enabled?: boolean;
  defaultModelId?: string;
  toolBudget?: TutorToolBudget;
  learningPlan?: LearningPlan;
  planGenerated?: boolean;
  planGenerationModel?: string;
  disablePlanGeneration?: boolean;
  planEditable?: boolean;
  enableLearnerModel?: boolean;
  learnerModelVisible?: boolean;
  learnerModel?: LearnerModel;
};

export type ChatFeatures = {
  search: ChatSearchSettings;
  /** Present only while the tutor module is installed. */
  tutor?: TutorSettings;
};

export type ChatSettings = {
  modelId: string;
  system?: string;
  generation: GenerationSettings;
  ui: ChatUiSettings;
  features: ChatFeatures;
};

export type ChatSettingsPatch = {
  modelId?: string;
  system?: string;
  generation?: Partial<GenerationSettings>;
  ui?: Partial<ChatUiSettings>;
  features?: {
    search?: Partial<ChatSearchSettings>;
    tutor?: Partial<TutorSettings>;
  };
};

export type ChatDefaults = {
  modelId?: string;
  system?: string;
  generation?: Partial<GenerationSettings>;
  ui?: Partial<ChatUiSettings>;
  features?: {
    search?: Partial<ChatSearchSettings>;
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
