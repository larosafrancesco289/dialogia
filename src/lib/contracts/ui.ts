import type { LearningPlan, ReasoningEffort } from '@/lib/types';

export type UiFlagsSnapshot = {
  experimentalTutor?: boolean;
};

export type UiNextOverrides = {
  modelId?: string;
  /** `provider` is a SearchMode: NATIVE_SEARCH_MODE or a registered provider id. */
  search?: { enabled?: boolean; provider?: string };
  tutorMode?: boolean;
  reasoning?: { effort?: ReasoningEffort; tokens?: number };
  system?: string;
  maxTokens?: number;
  show?: {
    thinking?: boolean;
    stats?: boolean;
    toolCallLog?: boolean;
    debugRawJson?: boolean;
  };
};

export type UiDebugEntry = {
  body: string;
  createdAt: number;
};

export type UiDebugSnapshot = {
  mode?: boolean;
  byMessageId?: Record<string, UiDebugEntry>;
  autoReasoningModelIds?: Record<string, true>;
};

export type UiSearchEntry = {
  query: string;
  status: 'loading' | 'done' | 'error';
  results?: { title?: string; url?: string; description?: string }[];
  error?: string;
};

export type UiSearchSnapshot = {
  tavilyByMessageId?: Record<string, UiSearchEntry>;
};

export type UiTutorSnapshot = {
  defaultModelId?: string;
  forceMode?: boolean;
  autoScroll?: boolean;
};

export type UiPlanSnapshot = {
  sheetOpen?: boolean;
  sheetPlanOverride?: LearningPlan | null;
  rightPanelOpen?: boolean;
  rightPanelTab?: 'plan' | 'progress';
  /** The Learning Hub shows its editing controls (Revise) instead of the contents. */
  revising?: boolean;
  generationByChatId?: Record<
    string,
    {
      status: 'idle' | 'loading' | 'ready' | 'error';
      goal?: string;
      startedAt?: number;
      completedAt?: number;
      error?: string;
      modelId?: string;
    }
  >;
};

export type UiMobileSnapshot = {
  /** The chat list, drawn in from the left edge. */
  drawerOpen: boolean;
  composerFocused: boolean;
};

export type NoticeTone = 'info' | 'success' | 'error';

export type UiSnapshot = {
  showSettings: boolean;
  /** First-run provider setup sheet; session-scoped, never persisted. */
  setupOpen?: boolean;
  activeTurnByChatId: Record<string, number>;
  notice?: string;
  /** How the notice reads: a passing fact, a confirmation, or something wrong. */
  noticeTone?: NoticeTone;
  overrides?: UiNextOverrides;
  zdrOnly?: boolean;
  messageTimestamps?: boolean;
  /** Last concrete model each dynamic default alias resolved to. */
  dynamicDefaultResolutions?: Record<string, string>;
  flags: UiFlagsSnapshot;
  debug: UiDebugSnapshot;
  search: UiSearchSnapshot;
  tutor?: UiTutorSnapshot;
  plan?: UiPlanSnapshot;
  mobile: UiMobileSnapshot;
};
