/**
 * The persisted value meaning "use the model provider's own web search". It
 * predates pluggable providers and reads oddly now, but it sits in users' chat
 * settings and must never be renamed.
 */
export const NATIVE_SEARCH_MODE = 'openrouter';

/**
 * `'openrouter'` for provider-native search, otherwise a registered tool-based
 * search provider id. Open by design: adding a provider must not touch core.
 */
export type SearchMode = string;

export const ReasoningEffortEnum = {
  None: 'none',
  Minimal: 'minimal',
  Low: 'low',
  Medium: 'medium',
  High: 'high',
  XHigh: 'xhigh',
  Max: 'max',
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
