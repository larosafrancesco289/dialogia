// Module: voice/constants
// Responsibility: Configuration constants for the voice agent pipeline

import type { VoiceConfig, VoiceLLMConfig, VoiceState } from './types';
import { ProviderSort } from '@/lib/models/providerSort';

// ─────────────────────────────────────────────────────────────────────────────
// Model Configuration
// ─────────────────────────────────────────────────────────────────────────────

/** Fal.AI Speech-to-Text model (streaming turbo for lower latency) */
export const STT_MODEL = 'fal-ai/speech-to-text/turbo/stream';

/** Fal.AI Text-to-Speech model */
export const TTS_MODEL = 'fal-ai/minimax/speech-2.6-turbo';

/** OpenRouter LLM configuration optimized for voice latency */
export const VOICE_LLM_CONFIG: VoiceLLMConfig = {
  model: 'moonshotai/kimi-k2-0905',
  maxTokens: 150, // Keep responses brief for voice
  provider: {
    sort: ProviderSort.Latency, // Route to fastest provider
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Voice Configuration
// ─────────────────────────────────────────────────────────────────────────────

/** Available MiniMax voice IDs */
export const MINIMAX_VOICES = {
  WISE_WOMAN: 'Wise_Woman',
  NARRATOR: 'Narrator',
  FRIENDLY_PERSON: 'Friendly_Person',
  CALM_WOMAN: 'Calm_Woman',
  YOUNG_KNIGHT: 'Young_Knight',
  WARM_WOMAN: 'Warm_Woman',
  DEEP_NARRATOR: 'Deep_Narrator',
} as const;

/** Default voice configuration */
export const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  voiceId: MINIMAX_VOICES.WISE_WOMAN,
  speed: 1.0,
  inputMode: 'vad',
  vadSensitivity: 'medium',
  silenceThresholdMs: 1500,
};

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline Timing Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Audio chunk interval for streaming to STT (ms) */
export const AUDIO_CHUNK_INTERVAL_MS = 100;

/** Minimum sentence length before TTS (characters) */
export const MIN_SENTENCE_LENGTH = 20;

/** Maximum concurrent TTS requests */
export const MAX_CONCURRENT_TTS = 3;

/** Number of audio chunks to buffer before starting playback */
export const AUDIO_BUFFER_AHEAD = 2;

/** VAD silence thresholds by sensitivity (dB) - higher = less sensitive */
export const VAD_THRESHOLDS = {
  low: -25,    // Only loud speech
  medium: -35, // Normal speech
  high: -45,   // Quiet speech
} as const;

/** VAD silence duration by sensitivity (ms) - how long silence before end */
export const VAD_SILENCE_DURATION = {
  low: 1800,
  medium: 1200,
  high: 800,
} as const;

/** Maximum listening time without valid speech before auto-reset (ms) */
export const MAX_LISTEN_WITHOUT_SPEECH_MS = 10000;

/** Recording timeout (max duration in ms) */
export const MAX_RECORDING_DURATION_MS = 60000;

/** Minimum recording duration before allowing stop (ms) - prevents accidental short recordings */
export const MIN_RECORDING_DURATION_MS = 500;

/** Minimum speech duration before triggering onSpeechEnd (ms) - prevents false triggers */
export const MIN_SPEECH_DURATION_MS = 300;

/** Cooldown after interruption before allowing new recording (ms) */
export const INTERRUPT_COOLDOWN_MS = 500;

/** Minimum audio blob size in bytes (smaller is likely empty/silent) */
export const MIN_AUDIO_BLOB_SIZE = 1000;

/** Debounce time for speech start detection (ms) */
export const SPEECH_START_DEBOUNCE_MS = 100;

/** Delay before LLM response to avoid interrupting brief pauses (ms) */
export const LLM_RESPONSE_DELAY_MS = 1000;

// ─────────────────────────────────────────────────────────────────────────────
// System Prompt
// ─────────────────────────────────────────────────────────────────────────────

export const VOICE_AGENT_SYSTEM_PROMPT = `You are Aria, a warm and thoughtful voice assistant. You have a calm, wise presence and genuinely enjoy helping people. Your responses will be spoken aloud, so optimize for natural listening.

## Your Personality
- You're patient, curious, and genuinely interested in what people share with you
- You speak with warmth and a gentle confidence
- You have a subtle sense of humor and aren't afraid to be playful when appropriate
- You're honest about your limitations without being apologetic about them
- You make people feel heard and understood

## Response Style
- Keep responses brief and conversational, typically 1-3 sentences
- Use natural contractions like "I'm", "don't", "can't", "we'll"
- Speak in a warm, friendly, and approachable tone
- Never use markdown formatting, bullet points, numbered lists, or emojis
- Avoid technical jargon unless the user uses it first

## Conversation Flow
- Acknowledge what the user said before diving into your response
- Use natural transitions: "So...", "Well...", "Actually...", "You know what..."
- Ask clarifying questions when something is ambiguous
- If you're unsure, say so naturally: "Hmm, I'm not entirely sure, but..."
- Be proactive and helpful without being overbearing

## Voice-Specific Guidelines
- Never spell out URLs letter by letter; say "google dot com" or describe the site
- Say numbers naturally: "twenty-three" instead of "23" for small numbers
- Use commas to create natural speech pauses
- Avoid parenthetical asides that work in text but sound awkward spoken
- Don't use abbreviations that sound weird when spoken aloud

## Examples of Good Responses

User: "What's the weather like?"
Good: "I don't have access to real-time weather data, but I'd be happy to help you figure out how to check. What city are you curious about?"

User: "Explain React hooks to me"
Good: "React hooks let you use state and other features in function components. The most common ones are useState for managing data that changes, and useEffect for running code when things update. Want me to go deeper on any specific hook?"

User: "Hey"
Good: "Hey there! What's on your mind?"

User: "Can you help me debug this?"
Good: "Of course! Tell me what's happening and what you expected to see instead."

## What to Avoid
- Long, lecture-style explanations
- Multiple paragraphs of text
- Technical documentation tone
- Robotic or overly formal language
- Starting every response with "I" or "Sure"
- Introducing yourself repeatedly after the first greeting`;

// ─────────────────────────────────────────────────────────────────────────────
// Default State
// ─────────────────────────────────────────────────────────────────────────────

/** Build default voice state */
export function buildDefaultVoiceState(): VoiceState {
  return {
    voiceMode: 'idle',
    isRecording: false,
    audioLevel: 0,
    recordingDurationMs: 0,
    partialTranscript: '',
    finalTranscript: '',
    llmStreamingText: '',
    llmComplete: false,
    isPlaying: false,
    playbackProgress: 0,
    audioQueue: [],
    currentAudioIndex: 0,
    metrics: {},
    voiceConfig: { ...DEFAULT_VOICE_CONFIG },
    error: undefined,
    retryCount: 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// API Endpoints
// ─────────────────────────────────────────────────────────────────────────────

/** STT proxy endpoint */
export const STT_ENDPOINT = '/api/fal/stt';

/** TTS proxy endpoint */
export const TTS_ENDPOINT = '/api/fal/tts';

// ─────────────────────────────────────────────────────────────────────────────
// Audio Configuration
// ─────────────────────────────────────────────────────────────────────────────

/** Supported audio formats for recording (ogg/mp4 for new STT model compatibility - wav not supported by MediaRecorder) */
export const SUPPORTED_AUDIO_FORMATS = ['audio/ogg', 'audio/mp4', 'audio/webm'] as const;

/** Preferred audio format (ogg works on Chrome/Firefox, mp4 fallback for Safari) */
export const PREFERRED_AUDIO_FORMAT = 'audio/ogg';

/** Audio sample rate for recording */
export const AUDIO_SAMPLE_RATE = 16000;

/** Audio context latency hint */
export const AUDIO_LATENCY_HINT = 'interactive' as const;
