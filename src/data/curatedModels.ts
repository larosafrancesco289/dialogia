type CuratedModel = {
  id: string;
  name: string;
  description: string;
};

// Ids starting with '~' are dynamic aliases resolved against the live model
// list (see src/lib/models/dynamicDefaults.ts), so defaults track releases.
export const DEFAULT_CHAT_MODEL: CuratedModel = {
  id: '~openai/gpt-latest',
  name: 'GPT Latest',
  description: 'The newest flagship GPT, for reasoning, writing and tools',
};

export const DEFAULT_TUTOR_MODEL: CuratedModel = {
  id: '~anthropic/frontier',
  name: 'Claude Frontier',
  description: 'The most capable Claude, and the tutor by default',
};

export const DEFAULT_MODEL_ID = DEFAULT_CHAT_MODEL.id;
export const DEFAULT_MODEL_NAME = DEFAULT_CHAT_MODEL.name;
export const DEFAULT_TUTOR_MODEL_ID = DEFAULT_TUTOR_MODEL.id;

export const CURATED_MODELS: CuratedModel[] = [
  DEFAULT_CHAT_MODEL,
  DEFAULT_TUTOR_MODEL,
  {
    id: 'google/gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro',
    description: 'Research across images and very long documents',
  },
  {
    id: 'moonshotai/kimi-k2.6',
    name: 'Kimi K2.6',
    description: 'Open weights, strong at code, good value',
  },
  {
    id: 'openai/gpt-5.4-image-2',
    name: 'GPT-5.4 Image 2',
    description: 'Makes and edits images',
  },
  {
    id: '~x-ai/grok-latest',
    name: 'Grok Latest',
    description: 'The newest Grok, for long agentic runs',
  },
];

export type { CuratedModel };
