// Module: openaiCompat/presets
// Responsibility: Common OpenAI-compatible server addresses to pre-fill
// Settings › Connections without guessing ports or `/v1` paths.

export type ServerPreset = {
  id: string;
  label: string;
  baseUrl: string;
};

/**
 * Built-in quick-fill entries for popular local and hosted OpenAI-compatible
 * endpoints. Selecting one only fills the form; capabilities stay off until
 * toggled or verified by Test connection.
 */
export const SERVER_PRESETS: readonly ServerPreset[] = [
  { id: 'ollama', label: 'Ollama', baseUrl: 'http://localhost:11434/v1' },
  { id: 'lm-studio', label: 'LM Studio', baseUrl: 'http://localhost:1234/v1' },
  { id: 'llama-cpp', label: 'llama.cpp', baseUrl: 'http://localhost:8080/v1' },
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  {
    id: 'gemini',
    label: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
  },
];
