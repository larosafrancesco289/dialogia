// xAI Voice Agent Types

export type XAIVoice = 'ara' | 'rex' | 'sal' | 'eve' | 'leo';

export interface VoiceConfig {
  voice: XAIVoice;
  instructions: string;
}

export interface VoiceState {
  isActive: boolean;
  isConnected: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  error: string | null;
  config: VoiceConfig;
}

export interface VoiceActions {
  setVoiceActive: (active: boolean) => void;
  setVoiceConnected: (connected: boolean) => void;
  setVoiceListening: (listening: boolean) => void;
  setVoiceSpeaking: (speaking: boolean) => void;
  setVoiceError: (error: string | null) => void;
  setVoiceConfig: (config: Partial<VoiceConfig>) => void;
  resetVoiceState: () => void;
  // Voice message actions (add to chat without triggering LLM)
  ensureChatForVoice: () => Promise<string>;
  addVoiceUserMessage: (content: string) => Promise<void>;
  addVoiceAssistantMessage: (content: string) => Promise<void>;
}

export const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  voice: 'eve',
  instructions:
    'You are a helpful voice assistant. Be concise and natural in your responses. Keep answers brief unless the user asks for detail.',
};

export const VOICE_OPTIONS: { value: XAIVoice; label: string; description: string }[] = [
  { value: 'eve', label: 'Eve', description: 'Natural and friendly female voice' },
  { value: 'ara', label: 'Ara', description: 'Clear and professional female voice' },
  { value: 'sal', label: 'Sal', description: 'Warm and approachable voice' },
  { value: 'rex', label: 'Rex', description: 'Deep and confident male voice' },
  { value: 'leo', label: 'Leo', description: 'Energetic and engaging male voice' },
];

export function buildDefaultVoiceState(): VoiceState {
  return {
    isActive: false,
    isConnected: false,
    isListening: false,
    isSpeaking: false,
    error: null,
    config: { ...DEFAULT_VOICE_CONFIG },
  };
}
