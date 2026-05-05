export const SearchProviderEnum = {
  Tavily: 'tavily',
  OpenRouter: 'openrouter',
} as const;

export type SearchProvider = (typeof SearchProviderEnum)[keyof typeof SearchProviderEnum];

export const ReasoningEffortEnum = {
  None: 'none',
  Low: 'low',
  Medium: 'medium',
  High: 'high',
  XHigh: 'xhigh',
} as const;

export type ReasoningEffort = (typeof ReasoningEffortEnum)[keyof typeof ReasoningEffortEnum];

export const MessageRoleEnum = {
  System: 'system',
  User: 'user',
  Assistant: 'assistant',
} as const;

export type MessageRole = (typeof MessageRoleEnum)[keyof typeof MessageRoleEnum];

export const ToolCallStatusEnum = {
  Pending: 'pending',
  Success: 'success',
  Error: 'error',
} as const;

export type ToolCallStatus = (typeof ToolCallStatusEnum)[keyof typeof ToolCallStatusEnum];

export const ToolCallCategoryEnum = {
  Search: 'search',
  Tutor: 'tutor',
  Planning: 'planning',
  System: 'system',
  Other: 'other',
} as const;

export type ToolCallCategory = (typeof ToolCallCategoryEnum)[keyof typeof ToolCallCategoryEnum];

export const MessageSourceEnum = {
  Voice: 'voice',
  Text: 'text',
} as const;

export type MessageSource = (typeof MessageSourceEnum)[keyof typeof MessageSourceEnum];

export const TutorResearchModeEnum = {
  BaselineChat: 'baseline_chat',
  PlanOnly: 'plan_only',
  ModelOnly: 'model_only',
  PlanPlusModel: 'plan_plus_model',
} as const;

export type TutorResearchMode = (typeof TutorResearchModeEnum)[keyof typeof TutorResearchModeEnum];

export const StudyConditionEnum = {
  A: 'A',
  B: 'B',
} as const;

export type StudyCondition = (typeof StudyConditionEnum)[keyof typeof StudyConditionEnum];
