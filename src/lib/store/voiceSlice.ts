// Module: store/voiceSlice
// Responsibility: Zustand slice for voice agent state management

import { createStoreSlice } from '@/lib/store/createSlice';
import { buildDefaultVoiceState } from '@/lib/voice/constants';
import type { VoiceMode, VoiceConfig, VoiceMetrics, AudioQueueItem } from '@/lib/voice/types';
import type { StoreState } from '@/lib/store/types';

export const createVoiceSlice = createStoreSlice((set, get) => {
  const initialVoice = buildDefaultVoiceState();

  return {
    voice: initialVoice,

    // Mode management
    startVoiceMode: () => {
      set((s) => ({
        voice: {
          ...s.voice,
          voiceMode: 'listening' as VoiceMode,
          error: undefined,
        },
      }));
    },

    stopVoiceMode: () => {
      set((s) => ({
        voice: {
          ...buildDefaultVoiceState(),
          voiceConfig: s.voice.voiceConfig, // Preserve config
        },
      }));
    },

    setVoiceMode: (mode: VoiceMode) => {
      set((s) => ({
        voice: {
          ...s.voice,
          voiceMode: mode,
        },
      }));
    },

    // Recording
    startRecording: async () => {
      set((s) => ({
        voice: {
          ...s.voice,
          isRecording: true,
          voiceMode: 'listening' as VoiceMode,
          partialTranscript: '',
          finalTranscript: '',
          recordingDurationMs: 0,
          error: undefined,
        },
      }));
    },

    stopRecording: () => {
      set((s) => ({
        voice: {
          ...s.voice,
          isRecording: false,
        },
      }));
    },

    // Interruption
    interruptPlayback: () => {
      set((s) => ({
        voice: {
          ...s.voice,
          voiceMode: 'interrupted' as VoiceMode,
          isPlaying: false,
          audioQueue: [],
          currentAudioIndex: 0,
          llmStreamingText: '',
          llmComplete: false,
        },
      }));
    },

    // Transcription
    updatePartialTranscript: (text: string) => {
      set((s) => ({
        voice: {
          ...s.voice,
          partialTranscript: text,
        },
      }));
    },

    commitTranscript: (text: string) => {
      set((s) => ({
        voice: {
          ...s.voice,
          finalTranscript: text,
          partialTranscript: '',
          voiceMode: 'processing' as VoiceMode,
        },
      }));
    },

    // LLM streaming
    appendLlmText: (delta: string) => {
      set((s) => ({
        voice: {
          ...s.voice,
          llmStreamingText: s.voice.llmStreamingText + delta,
        },
      }));
    },

    completeLlmResponse: () => {
      set((s) => ({
        voice: {
          ...s.voice,
          llmComplete: true,
        },
      }));
    },

    // Audio playback
    queueAudio: (item: AudioQueueItem) => {
      set((s) => ({
        voice: {
          ...s.voice,
          audioQueue: [...s.voice.audioQueue, item],
        },
      }));
    },

    playNextAudio: () => {
      set((s) => {
        const nextIndex = s.voice.currentAudioIndex + 1;
        return {
          voice: {
            ...s.voice,
            currentAudioIndex: nextIndex,
            isPlaying: nextIndex < s.voice.audioQueue.length,
          },
        };
      });
    },

    clearAudioQueue: () => {
      set((s) => ({
        voice: {
          ...s.voice,
          audioQueue: [],
          currentAudioIndex: 0,
          isPlaying: false,
        },
      }));
    },

    setIsPlaying: (playing: boolean) => {
      set((s) => ({
        voice: {
          ...s.voice,
          isPlaying: playing,
          voiceMode: playing ? ('speaking' as VoiceMode) : s.voice.voiceMode,
        },
      }));
    },

    // Audio level for visualization
    setAudioLevel: (level: number) => {
      set((s) => ({
        voice: {
          ...s.voice,
          audioLevel: Math.max(0, Math.min(1, level)),
        },
      }));
    },

    // Recording duration
    setRecordingDuration: (ms: number) => {
      set((s) => ({
        voice: {
          ...s.voice,
          recordingDurationMs: ms,
        },
      }));
    },

    // Configuration
    setVoiceConfig: (config: Partial<VoiceConfig>) => {
      set((s) => ({
        voice: {
          ...s.voice,
          voiceConfig: {
            ...s.voice.voiceConfig,
            ...config,
          },
        },
      }));
    },

    // Error handling
    setVoiceError: (error: string | undefined) => {
      set((s) => ({
        voice: {
          ...s.voice,
          error,
          voiceMode: error ? ('idle' as VoiceMode) : s.voice.voiceMode,
        },
      }));
    },

    clearVoiceError: () => {
      set((s) => ({
        voice: {
          ...s.voice,
          error: undefined,
        },
      }));
    },

    // Reset
    resetVoiceState: () => {
      set((s) => ({
        voice: {
          ...buildDefaultVoiceState(),
          voiceConfig: s.voice.voiceConfig, // Preserve config
        },
      }));
    },

    // Metrics
    updateMetrics: (metrics: Partial<VoiceMetrics>) => {
      set((s) => ({
        voice: {
          ...s.voice,
          metrics: {
            ...s.voice.metrics,
            ...metrics,
          },
        },
      }));
    },
  } satisfies Partial<StoreState>;
});
