type CuratedModel = { id: string; name: string };

export const DEFAULT_CHAT_MODEL: CuratedModel = {
  id: 'x-ai/grok-4.1-fast',
  name: 'Grok 4.1 Fast',
};

export const DEFAULT_TUTOR_MODEL: CuratedModel = {
  id: 'x-ai/grok-4.1-fast',
  name: 'Grok 4.1 Fast',
};

export const DEFAULT_MODEL_ID = DEFAULT_CHAT_MODEL.id;
export const DEFAULT_MODEL_NAME = DEFAULT_CHAT_MODEL.name;
export const DEFAULT_TUTOR_MODEL_ID = DEFAULT_TUTOR_MODEL.id;

export const CURATED_MODELS: CuratedModel[] = [
  DEFAULT_CHAT_MODEL,
  { id: 'openai/gpt-5', name: 'GPT-5' },
  { id: 'x-ai/grok-4.1-fast', name: 'Grok 4.1 Fast' },
  { id: 'google/gemini-2.5-flash-image-preview', name: 'Gemini 2.5 Flash Image Preview' },
  { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5' },
];
