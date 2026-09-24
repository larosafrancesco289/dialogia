type CuratedModel = {
  id: string;
  name: string;
  description: string;
};

// Most picks are model families ('~vendor/family-latest', OpenRouter's own
// alias ids), resolved against the live model list to the concrete model they
// name today (src/lib/models/dynamicDefaults.ts). A new chat pins the model
// its family resolved to; the family only moves what new chats start with.
export const DEFAULT_CHAT_MODEL: CuratedModel = {
  id: '~openai/gpt-luna-latest',
  name: 'GPT Luna',
  description: 'Fast, inexpensive and good with tools; new chats start here',
};

// Pinned, not a family: the tutor's prompt and its simulator checks are tuned
// on this exact model. If it disappears, the tutor falls back to GPT Luna.
export const DEFAULT_TUTOR_MODEL: CuratedModel = {
  id: 'openai/gpt-6-luna',
  name: 'GPT-6 Luna',
  description: 'Fast, inexpensive and reliable with tools; the tutor by default',
};

export const DEFAULT_MODEL_ID = DEFAULT_CHAT_MODEL.id;
export const DEFAULT_MODEL_NAME = DEFAULT_CHAT_MODEL.name;
export const DEFAULT_TUTOR_MODEL_ID = DEFAULT_TUTOR_MODEL.id;

/**
 * What new chats start with, in order of preference: the first one the user's
 * providers can serve wins. A Claude API key alone starts with Claude Opus,
 * Anthropic's own recommended default.
 */
export const DEFAULT_MODEL_PREFERENCE: readonly string[] = [
  DEFAULT_MODEL_ID,
  '~anthropic/claude-opus-latest',
];

/** The tutor's fallbacks when its pinned model is gone. */
export const TUTOR_MODEL_PREFERENCE: readonly string[] = [
  DEFAULT_TUTOR_MODEL_ID,
  '~openai/gpt-luna-latest',
  ...DEFAULT_MODEL_PREFERENCE,
];

export const CURATED_MODELS: CuratedModel[] = [
  DEFAULT_CHAT_MODEL,
  {
    id: '~openai/gpt-sol-latest',
    name: 'GPT Sol',
    description: "OpenAI's mainline tier, for harder reasoning and writing",
  },
  {
    id: '~anthropic/claude-opus-latest',
    name: 'Claude Opus',
    description: 'Careful, long-running work; Anthropic’s recommended default',
  },
  {
    id: '~anthropic/claude-fable-latest',
    name: 'Claude Fable',
    description: 'The most capable Claude, for the hardest problems; the priciest',
  },
  {
    id: '~google/gemini-pro-latest',
    name: 'Gemini Pro',
    description: 'Research across images and very long documents',
  },
  {
    id: '~moonshotai/kimi-latest',
    name: 'Kimi',
    description: 'Open weights, strong at code, good value',
  },
  {
    id: '~x-ai/grok-latest',
    name: 'Grok',
    description: 'The newest Grok, for long agentic runs',
  },
  {
    id: 'openai/gpt-5.4-image-2',
    name: 'GPT-5.4 Image 2',
    description: 'Makes and edits images',
  },
];

export type { CuratedModel };
