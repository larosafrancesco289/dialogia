import { DEFAULT_MODEL_ID, DEFAULT_MODEL_NAME } from '@/lib/constants';

export const CURATED_MODELS: { id: string; name: string }[] = [
  { id: DEFAULT_MODEL_ID, name: DEFAULT_MODEL_NAME },
  { id: 'openai/gpt-5', name: 'GPT-5' },
  { id: 'x-ai/grok-4-fast', name: 'Grok 4 Fast' },
  { id: 'deepseek/deepseek-v3.1-terminus', name: 'DeepSeek Chat V3.1 Terminus' },
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
  { id: 'google/gemini-2.5-flash-image-preview', name: 'Gemini 2.5 Flash Image Preview' },
];
