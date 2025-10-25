import type { ProviderSort } from '@/lib/models/providerSort';

export type ModelTransport = 'openrouter' | 'anthropic';

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
  tutor_memory?: string;
  tutor_memory_version?: number;
  tutor_memory_message_count?: number;
  tutor_memory_frequency?: number;
  tutor_memory_disabled?: boolean;
  tutor_memory_model?: string;
};

export type Message = {
  id: string;
  chatId: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  // Not shown in the UI, but included in LLM conversation history
  hiddenContent?: string;
  // Snapshot of the exact system prompt used for this assistant message
  // so regen can reproduce the same context even if chat settings changed.
  systemSnapshot?: string;
  // Snapshot of generation settings used for this assistant message
  // (temperature, top_p, tokens, reasoning, and feature toggles)
  genSettings?: {
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
    reasoning_effort?: 'none' | 'low' | 'medium' | 'high';
    reasoning_tokens?: number;
    search_enabled?: boolean;
    search_provider?: 'brave' | 'openrouter';
    tutor_mode?: boolean;
    providerSort?: ProviderSort;
  };
  // OpenRouter: file parsing annotations returned by assistant (e.g., PDF parsing)
  // When present, we include them in subsequent requests to skip re-parsing costs.
  annotations?: any;
  createdAt: number;
  tokensIn?: number;
  tokensOut?: number;
  model?: string;
  // For thinking models; accumulated via streaming
  reasoning?: string;
  metrics?: MessageMetrics;
  // Optional attachments (currently images) associated to the message
  attachments?: Attachment[];
  // Optional: persisted tutor payload for interactive content and attempts
  tutor?: MessageTutor;
  tutorWelcome?: boolean;
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

// Persisted tutor payload attached to an assistant message
export type MessageTutor = {
  title?: string;
  mcq?: TutorMCQItem[];
  fillBlank?: TutorFillBlankItem[];
  openEnded?: TutorOpenItem[];
  flashcards?: TutorFlashcardItem[];
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

export type MessageMetrics = {
  ttftMs?: number; // time to first token (ms)
  completionMs?: number; // total time until done (ms)
  promptTokens?: number;
  completionTokens?: number;
  tokensPerSec?: number; // actual throughput when usage present
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

export type ORModel = {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: number; completion?: number; currency?: string };
  raw?: any;
  // Transport/provider metadata for multi-provider routing.
  transport?: ModelTransport;
  transportModelId?: string;
  providerDisplay?: string;
};

export type KVRecord = {
  key: string;
  value: any;
};

// Attachments supported by the UI (phase 1: images only)
export type Attachment = {
  id: string;
  kind: 'image' | 'pdf' | 'audio';
  name?: string;
  mime: string; // e.g., image/png, image/jpeg, image/webp, application/pdf
  size?: number; // bytes
  // image-only
  width?: number;
  height?: number;
  // image/audio data URL for preview (data:... or blob:)
  dataURL?: string;
  // pdf-only
  pageCount?: number;
  // extracted plain text (pdf); trimmed/selected later for prompt
  text?: string;
  // ephemeral: original file handle available in composer before sending (not relied on for persistence)
  file?: File;
  // audio-only: base64-encoded payload (no data: prefix), and format hint for OpenRouter
  base64?: string;
  audioFormat?: 'wav' | 'mp3';
};
