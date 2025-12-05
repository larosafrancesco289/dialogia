// Module: voice/types
// Responsibility: Type definitions for the voice agent pipeline

/** Voice pipeline modes */
export type VoiceMode = 'idle' | 'listening' | 'processing' | 'speaking' | 'interrupted';

/** User input mode preference */
export type VoiceInputMode = 'push-to-talk' | 'vad';

/** VAD sensitivity levels */
export type VADSensitivity = 'low' | 'medium' | 'high';

/** Voice configuration for TTS */
export interface VoiceConfig {
  /** MiniMax voice ID for TTS */
  voiceId: string;
  /** Speech speed (0.5-2.0) */
  speed: number;
  /** Input mode: push-to-talk or voice activity detection */
  inputMode: VoiceInputMode;
  /** VAD sensitivity (only used when inputMode is 'vad') */
  vadSensitivity: VADSensitivity;
  /** Silence threshold in ms before finalizing (VAD mode) */
  silenceThresholdMs: number;
}

/** Metrics for monitoring pipeline performance */
export interface VoiceMetrics {
  /** Speech-to-text latency in ms */
  sttLatencyMs?: number;
  /** LLM time-to-first-token in ms */
  llmTtftMs?: number;
  /** LLM total completion time in ms */
  llmTotalMs?: number;
  /** Text-to-speech latency in ms */
  ttsLatencyMs?: number;
  /** Total time-to-first-audio in ms */
  totalTtfaMs?: number;
}

/** Audio queue item for TTS playback */
export interface AudioQueueItem {
  /** Unique ID for this audio chunk */
  id: string;
  /** Audio buffer data */
  audioBuffer: ArrayBuffer;
  /** Text that was synthesized */
  text: string;
  /** Duration in ms */
  durationMs?: number;
}

/** Transcript entry for history */
export interface TranscriptEntry {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
  /** Source metadata */
  source: 'voice';
  /** Audio length for user entries */
  audioLengthMs?: number;
  /** Spoken duration for assistant entries */
  spokeDurationMs?: number;
}

/** Voice state managed by Zustand */
export interface VoiceState {
  /** Current pipeline mode */
  voiceMode: VoiceMode;
  /** Whether actively recording */
  isRecording: boolean;
  /** Audio level 0-1 for waveform visualization */
  audioLevel: number;
  /** Recording duration in ms */
  recordingDurationMs: number;
  /** Partial transcript (while speaking) */
  partialTranscript: string;
  /** Final transcript (after silence) */
  finalTranscript: string;
  /** Streaming text from LLM */
  llmStreamingText: string;
  /** Whether LLM response is complete */
  llmComplete: boolean;
  /** Whether audio is playing */
  isPlaying: boolean;
  /** Audio playback progress 0-1 */
  playbackProgress: number;
  /** Queue of audio to play */
  audioQueue: AudioQueueItem[];
  /** Current audio index being played */
  currentAudioIndex: number;
  /** Performance metrics */
  metrics: VoiceMetrics;
  /** Voice configuration */
  voiceConfig: VoiceConfig;
  /** Error message if any */
  error?: string;
  /** Retry count for error recovery */
  retryCount: number;
}

/** Voice actions for Zustand store */
export interface VoiceActions {
  /** Enter voice conversation mode */
  startVoiceMode: () => void;
  /** Exit voice conversation mode */
  stopVoiceMode: () => void;
  /** Start recording from microphone */
  startRecording: () => Promise<void>;
  /** Stop recording */
  stopRecording: () => void;
  /** Interrupt current playback and pending requests */
  interruptPlayback: () => void;
  /** Update partial transcript from STT */
  updatePartialTranscript: (text: string) => void;
  /** Commit final transcript from STT */
  commitTranscript: (text: string) => void;
  /** Append streaming text from LLM */
  appendLlmText: (delta: string) => void;
  /** Mark LLM response as complete */
  completeLlmResponse: () => void;
  /** Queue audio for playback */
  queueAudio: (item: AudioQueueItem) => void;
  /** Play next audio in queue */
  playNextAudio: () => void;
  /** Clear audio queue */
  clearAudioQueue: () => void;
  /** Update audio level for visualization */
  setAudioLevel: (level: number) => void;
  /** Update recording duration */
  setRecordingDuration: (ms: number) => void;
  /** Update voice configuration */
  setVoiceConfig: (config: Partial<VoiceConfig>) => void;
  /** Set error state */
  setVoiceError: (error: string | undefined) => void;
  /** Clear error state */
  clearVoiceError: () => void;
  /** Reset all voice state */
  resetVoiceState: () => void;
  /** Update metrics */
  updateMetrics: (metrics: Partial<VoiceMetrics>) => void;
  /** Set voice mode directly */
  setVoiceMode: (mode: VoiceMode) => void;
  /** Set playing state */
  setIsPlaying: (playing: boolean) => void;
}

/** Combined voice slice type */
export type VoiceSlice = VoiceState & VoiceActions;

/** STT request payload */
export interface STTRequest {
  /** Audio blob to transcribe */
  audio: Blob;
  /** Whether to use punctuation and capitalization */
  usePnc?: boolean;
}

/** STT response event */
export interface STTEvent {
  /** Partial transcript (while speaking) */
  partial?: string;
  /** Final transcript (after silence) */
  final?: string;
  /** Confidence score 0-1 */
  confidence?: number;
}

/** TTS request payload */
export interface TTSRequest {
  /** Text to synthesize */
  text: string;
  /** Voice ID */
  voiceId?: string;
  /** Speed multiplier */
  speed?: number;
  /** Output format */
  outputFormat?: 'url' | 'hex';
}

/** TTS response */
export interface TTSResponse {
  /** Audio URL or data */
  audio: {
    url?: string;
    data?: ArrayBuffer;
  };
  /** Duration in ms */
  durationMs?: number;
}

/** LLM config for voice */
export interface VoiceLLMConfig {
  model: string;
  maxTokens: number;
  temperature?: number;
  provider: {
    sort: import('@/lib/models/providerSort').ProviderSort;
  };
}

/** Abort controller refs for the pipeline */
export interface PipelineControllers {
  stt?: AbortController;
  llm?: AbortController;
  tts?: AbortController;
}
