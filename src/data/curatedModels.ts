type CuratedModel = { id: string; name: string };

export const DEFAULT_CHAT_MODEL: CuratedModel = {
  id: 'moonshotai/kimi-k2-0905',
  name: 'Kimi K2',
};

export const DEFAULT_TUTOR_MODEL: CuratedModel = DEFAULT_CHAT_MODEL;
export const DEFAULT_TUTOR_MEMORY_MODEL: CuratedModel = DEFAULT_TUTOR_MODEL;

export const DEFAULT_MODEL_ID = DEFAULT_CHAT_MODEL.id;
export const DEFAULT_MODEL_NAME = DEFAULT_CHAT_MODEL.name;
export const DEFAULT_TUTOR_MODEL_ID = DEFAULT_TUTOR_MODEL.id;
export const DEFAULT_TUTOR_MEMORY_MODEL_ID = DEFAULT_TUTOR_MEMORY_MODEL.id;

export const CURATED_MODELS: CuratedModel[] = [
  DEFAULT_CHAT_MODEL,
  { id: 'openai/gpt-5', name: 'GPT-5' },
  { id: 'x-ai/grok-4-fast', name: 'Grok 4 Fast' },
  { id: 'google/gemini-2.5-flash-image-preview', name: 'Gemini 2.5 Flash Image Preview' },
  { id: 'anthropic/claude-opus-4.1', name: 'Claude Opus 4.1' },
];
