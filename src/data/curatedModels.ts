import type { MessageKey } from '@/lib/i18n';

type CuratedModel = {
  id: string;
  name: string;
  /** What it is good for, in the language shown (`models.curated.*`). */
  description: MessageKey;
};

// Most picks are model families ('~vendor/family-latest', OpenRouter's own
// alias ids), resolved against the live model list to the concrete model they
// name today (src/lib/models/dynamicDefaults.ts). A new chat pins the model
// its family resolved to; the family only moves what new chats start with.
export const DEFAULT_CHAT_MODEL: CuratedModel = {
  id: '~anthropic/claude-haiku-latest',
  name: 'Claude Haiku',
  description: 'models.curated.claudeHaiku',
};

const GPT_LUNA: CuratedModel = {
  id: '~openai/gpt-luna-latest',
  name: 'GPT Luna',
  description: 'models.curated.gptLuna',
};

// Pinned, not a family: the tutor's prompt and its simulator checks are tuned
// on this exact model, at high effort (tutorDefaultEffort in
// src/lib/models/defaultModels.ts). If it disappears, the tutor falls back to
// GPT Luna.
export const DEFAULT_TUTOR_MODEL: CuratedModel = {
  id: 'anthropic/claude-haiku-5.5',
  name: 'Claude Haiku 5.5',
  description: 'models.curated.tutor',
};

export const DEFAULT_MODEL_ID = DEFAULT_CHAT_MODEL.id;
export const DEFAULT_TUTOR_MODEL_ID = DEFAULT_TUTOR_MODEL.id;

/**
 * What new chats start with, in order of preference: the first one the user's
 * providers can serve wins. Claude Haiku is served on OpenRouter and on a
 * Claude API key alike, so either key starts with the same model.
 */
export const DEFAULT_MODEL_PREFERENCE: readonly string[] = [
  DEFAULT_MODEL_ID,
  GPT_LUNA.id,
  '~anthropic/claude-opus-latest',
];

/** The tutor's fallbacks when its pinned model is gone. */
export const TUTOR_MODEL_PREFERENCE: readonly string[] = [
  DEFAULT_TUTOR_MODEL_ID,
  GPT_LUNA.id,
  ...DEFAULT_MODEL_PREFERENCE,
];

export const CURATED_MODELS: CuratedModel[] = [
  DEFAULT_CHAT_MODEL,
  GPT_LUNA,
  {
    id: '~openai/gpt-sol-latest',
    name: 'GPT Sol',
    description: 'models.curated.gptSol',
  },
  {
    id: '~anthropic/claude-opus-latest',
    name: 'Claude Opus',
    description: 'models.curated.claudeOpus',
  },
  {
    id: '~anthropic/claude-fable-latest',
    name: 'Claude Fable',
    description: 'models.curated.claudeFable',
  },
  {
    id: '~google/gemini-flash-latest',
    name: 'Gemini Flash',
    description: 'models.curated.geminiFlash',
  },
  {
    id: '~moonshotai/kimi-latest',
    name: 'Kimi',
    description: 'models.curated.kimi',
  },
  {
    id: '~x-ai/grok-latest',
    name: 'Grok',
    description: 'models.curated.grok',
  },
  {
    id: 'openai/gpt-5.4-image-2',
    name: 'GPT-5.4 Image 2',
    description: 'models.curated.image',
  },
];

export type { CuratedModel };
