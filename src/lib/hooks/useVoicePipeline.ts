'use client';

// Module: hooks/useVoicePipeline
// Responsibility: Orchestrate the voice agent pipeline: STT → LLM → TTS

import { useCallback, useRef, useEffect } from 'react';
import { useChatStore } from '@/lib/store';
import { useVoiceRecording } from './useVoiceRecording';
import { useAudioPlayback } from './useAudioPlayback';
import { useVAD } from './useVAD';
import { transcribeAudio, synthesizeSpeech, prewarmConnections } from '@/lib/api/falClient';
import { createSentenceChunkerStream } from '@/lib/voice/sentenceChunker';
import { VOICE_LLM_CONFIG, VOICE_AGENT_SYSTEM_PROMPT } from '@/lib/voice/constants';
import { streamChatCompletion } from '@/lib/openrouter';
import { requireClientKeyOrProxy } from '@/lib/config';
import type { ModelMessage } from '@/lib/agent/types';
import type { VoiceMode, PipelineControllers } from '@/lib/voice/types';

export interface UseVoicePipelineResult {
  /** Current voice mode */
  voiceMode: VoiceMode;
  /** Whether voice is enabled */
  isEnabled: boolean;
  /** Whether currently recording */
  isRecording: boolean;
  /** Whether audio is playing */
  isPlaying: boolean;
  /** Audio level for visualization */
  audioLevel: number;
  /** Partial transcript (while speaking) */
  partialTranscript: string;
  /** Final transcript */
  finalTranscript: string;
  /** LLM streaming text */
  llmText: string;
  /** Error message */
  error: string | undefined;
  /** Start voice mode */
  start: () => Promise<void>;
  /** Stop voice mode */
  stop: () => void;
  /** Start recording (push-to-talk) */
  startRecording: () => Promise<void>;
  /** Stop recording and process */
  stopRecording: () => Promise<void>;
  /** Interrupt current playback */
  interrupt: () => void;
}

/**
 * Main hook for orchestrating the voice agent pipeline
 */
export function useVoicePipeline(): UseVoicePipelineResult {
  // Store state
  const {
    voice,
    setVoiceMode,
    startVoiceMode,
    stopVoiceMode,
    updatePartialTranscript,
    commitTranscript,
    appendLlmText,
    completeLlmResponse,
    interruptPlayback,
    updateMetrics,
    setVoiceError,
    resetVoiceState,
  } = useChatStore();

  // Recording hook
  const recording = useVoiceRecording();
  const {
    startRecording: beginRecording,
    stopRecording: endRecording,
    cancelRecording,
    isRecording,
  } = recording;

  // Playback hook
  const playback = useAudioPlayback();
  const {
    play: playAudio,
    queueAudio,
    stop: stopPlayback,
    isPlaying: isAudioPlaying,
    queueLength: playbackQueueLength,
  } = playback;

  // Abort controllers for pipeline stages
  const controllersRef = useRef<PipelineControllers>({});
  const streamRef = useRef<MediaStream | null>(null);
  const chunkerRef = useRef<ReturnType<typeof createSentenceChunkerStream> | null>(null);
  const ttsQueueRef = useRef<Promise<void>[]>([]);
  const isProcessingRef = useRef(false);
  const voiceHistoryRef = useRef<ModelMessage[]>([
    { role: 'system', content: VOICE_AGENT_SYSTEM_PROMPT },
  ]);

  // VAD for interruption detection during playback
  const vad = useVAD({
    sensitivity: voice.voiceConfig.vadSensitivity,
    silenceThresholdMs: voice.voiceConfig.silenceThresholdMs,
    onSpeechStart: () => {
      // If playing audio and user starts speaking, interrupt
      if (voice.voiceMode === 'speaking' || isAudioPlaying) {
        handleInterrupt();
      }
    },
  });
  const {
    start: startVad,
    stop: stopVad,
    isSpeaking: vadIsSpeaking,
    audioLevel: vadAudioLevel,
  } = vad;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortAll();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  /**
   * Abort all pending pipeline requests
   */
  const abortAll = useCallback(() => {
    controllersRef.current.stt?.abort();
    controllersRef.current.llm?.abort();
    controllersRef.current.tts?.abort();
    controllersRef.current = {};
    ttsQueueRef.current = [];
  }, []);

  /**
   * Reset the in-memory voice conversation history
   */
  const resetVoiceHistory = useCallback(() => {
    voiceHistoryRef.current = [{ role: 'system', content: VOICE_AGENT_SYSTEM_PROMPT }];
  }, []);

  /**
   * Handle interruption
   */
  const handleInterrupt = useCallback(() => {
    abortAll();
    stopPlayback();
    interruptPlayback();
    chunkerRef.current?.reset();
    isProcessingRef.current = false;

    // Resume listening after short delay
    setTimeout(() => {
      if (voice.voiceConfig.inputMode === 'vad') {
        setVoiceMode('listening');
      } else {
        setVoiceMode('idle');
      }
    }, 100);
  }, [abortAll, stopPlayback, interruptPlayback, voice.voiceConfig.inputMode, setVoiceMode]);

  /**
   * Process audio through the pipeline: STT → LLM → TTS
   */
  const processPipeline = useCallback(
    async (audioBlob: Blob) => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;

      const sttStartTime = Date.now();

      try {
        // Create new abort controllers
        controllersRef.current = {
          stt: new AbortController(),
          llm: new AbortController(),
          tts: new AbortController(),
        };

        // === STAGE 1: Speech-to-Text ===
        setVoiceMode('processing');

        let finalText = '';

        await transcribeAudio(
          audioBlob,
          {
            onPartial: (text) => {
              updatePartialTranscript(text);
            },
            onFinal: (text) => {
              finalText = text;
            },
            onError: (err) => {
              throw err;
            },
          },
          controllersRef.current.stt?.signal
        );

        if (!finalText.trim()) {
          // No speech detected
          setVoiceMode('idle');
          isProcessingRef.current = false;
          return;
        }

        const sttEndTime = Date.now();
        updateMetrics({ sttLatencyMs: sttEndTime - sttStartTime });

        commitTranscript(finalText);

        // === STAGE 2: LLM Response with Streaming TTS ===
        const llmStartTime = Date.now();
        let ttftRecorded = false;
        let ttsStartTime: number | null = null;
        let assistantText = '';

        const voiceHistory = [
          ...voiceHistoryRef.current,
          { role: 'user', content: finalText },
        ] satisfies ModelMessage[];

        // Set up sentence chunker for incremental TTS
        chunkerRef.current = createSentenceChunkerStream({
          onSentence: async (sentence) => {
            // Queue TTS for each sentence
            if (!ttsStartTime) {
              ttsStartTime = Date.now();
            }

            const ttsPromise = synthesizeSpeech(
              {
                text: sentence,
                voiceId: voice.voiceConfig.voiceId,
                speed: voice.voiceConfig.speed,
              },
              controllersRef.current.tts?.signal
            )
              .then((result) => {
                if (result.audioUrl) {
                  queueAudio({
                    id: crypto.randomUUID(),
                    url: result.audioUrl,
                    text: sentence,
                  });
                }
              })
              .catch((err) => {
                if (err.name !== 'AbortError') {
                  console.error('TTS error:', err);
                }
              });

            ttsQueueRef.current.push(ttsPromise);
          },
        });

        // Get API key for OpenRouter (may be empty in proxy mode)
        const { key: apiKey, useProxy } = requireClientKeyOrProxy();
        if (!apiKey && !useProxy) {
          throw new Error('OpenRouter API key not configured');
        }

        // Stream LLM response (apiKey can be empty string when using proxy)
        await streamChatCompletion({
          apiKey: apiKey || '',
          model: VOICE_LLM_CONFIG.model,
          messages: voiceHistory,
          max_tokens: VOICE_LLM_CONFIG.maxTokens,
          temperature: VOICE_LLM_CONFIG.temperature,
          providerSort: VOICE_LLM_CONFIG.provider.sort,
          signal: controllersRef.current.llm?.signal,
          callbacks: {
            onToken: (delta) => {
              // Record TTFT
              if (!ttftRecorded) {
                const ttft = Date.now() - llmStartTime;
                updateMetrics({ llmTtftMs: ttft });
                ttftRecorded = true;
              }

              appendLlmText(delta);
              chunkerRef.current?.push(delta);
              assistantText += delta;
            },
            onDone: () => {
              // Flush remaining text
              chunkerRef.current?.complete();
              completeLlmResponse();

              const llmEndTime = Date.now();
              updateMetrics({ llmTotalMs: llmEndTime - llmStartTime });

              voiceHistoryRef.current = [
                ...voiceHistory,
                { role: 'assistant', content: assistantText },
              ];
            },
            onError: (err) => {
              throw err;
            },
          },
        });

        // Wait for all TTS to complete
        await Promise.all(ttsQueueRef.current);

        if (ttsStartTime) {
          updateMetrics({ ttsLatencyMs: Date.now() - ttsStartTime });
        }

        // Calculate total TTFA
        updateMetrics({
          totalTtfaMs: Date.now() - sttStartTime,
        });

        // Start playback if not already started
        if (!isAudioPlaying && playbackQueueLength > 0) {
          setVoiceMode('speaking');
          await playAudio();
        } else if (playbackQueueLength === 0) {
          const nextMode = voice.voiceConfig.inputMode === 'vad' ? 'listening' : 'idle';
          setVoiceMode(nextMode);
          if (nextMode === 'listening' && !isRecording) {
            try {
              await beginRecording();
            } catch (recErr) {
              const message = recErr instanceof Error ? recErr.message : 'Microphone error';
              setVoiceError(message);
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Aborted, ignore
          return;
        }

        const errorMessage = err instanceof Error ? err.message : 'Pipeline error';
        setVoiceError(errorMessage);
        console.error('Voice pipeline error:', err);
      } finally {
        isProcessingRef.current = false;
        ttsQueueRef.current = [];
      }
    },
    [
      setVoiceMode,
      updatePartialTranscript,
      commitTranscript,
      appendLlmText,
      completeLlmResponse,
      updateMetrics,
      setVoiceError,
      voice.voiceConfig,
      isAudioPlaying,
      playbackQueueLength,
      playAudio,
      queueAudio,
      beginRecording,
      isRecording,
    ]
  );

  /**
   * Start voice mode
   */
  const start = useCallback(async () => {
    // Pre-warm connections
    prewarmConnections();

    // Request microphone permission
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.name === 'NotAllowedError'
            ? 'Microphone permission denied'
            : err.message
          : 'Microphone error';
      setVoiceError(message);
      return;
    }

    startVoiceMode();

    // Start VAD monitoring for interruption detection
    if (streamRef.current) {
      startVad(streamRef.current);
    }

    // In VAD mode, start recording immediately
    if (voice.voiceConfig.inputMode === 'vad') {
      await beginRecording();
    }
  }, [startVoiceMode, setVoiceError, voice.voiceConfig.inputMode, beginRecording, startVad]);

  /**
   * Stop voice mode completely
   */
  const stop = useCallback(() => {
    abortAll();
    cancelRecording();
    stopPlayback();
    stopVad();
    stopVoiceMode();
    resetVoiceHistory();

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, [abortAll, cancelRecording, stopPlayback, stopVad, stopVoiceMode, resetVoiceHistory]);

  /**
   * Start recording (push-to-talk mode)
   */
  const startRecordingPTT = useCallback(async () => {
    if (voice.voiceConfig.inputMode !== 'push-to-talk') return;
    await beginRecording();
    setVoiceMode('listening');
  }, [voice.voiceConfig.inputMode, beginRecording, setVoiceMode]);

  /**
   * Stop recording and process (push-to-talk mode)
   */
  const stopRecordingPTT = useCallback(async () => {
    const audioBlob = await endRecording();
    if (audioBlob) {
      await processPipeline(audioBlob);
    }
  }, [endRecording, processPipeline]);

  // Handle VAD-based recording end
  useEffect(() => {
    if (voice.voiceConfig.inputMode === 'vad' && !vadIsSpeaking && isRecording) {
      // Silence detected, stop and process
      endRecording().then((blob) => {
        if (blob) {
          processPipeline(blob);
        }
      });
    }
  }, [vadIsSpeaking, voice.voiceConfig.inputMode, isRecording, endRecording, processPipeline]);

  // When playback finishes, return to listening/idle so the user can continue talking
  useEffect(() => {
    if (isAudioPlaying) return;
    if (isProcessingRef.current) return;
    if (voice.voiceMode !== 'speaking' && voice.voiceMode !== 'processing') return;

    const nextMode = voice.voiceConfig.inputMode === 'vad' ? 'listening' : 'idle';
    setVoiceMode(nextMode);

    if (nextMode === 'listening' && !isRecording) {
      beginRecording().catch((err) => {
        const message = err instanceof Error ? err.message : 'Microphone error';
        setVoiceError(message);
      });
    }
  }, [
    isAudioPlaying,
    voice.voiceMode,
    voice.voiceConfig.inputMode,
    isRecording,
    beginRecording,
    setVoiceMode,
    setVoiceError,
  ]);

  return {
    voiceMode: voice.voiceMode,
    isEnabled: voice.voiceMode !== 'idle',
    isRecording,
    isPlaying: isAudioPlaying,
    audioLevel: recording.audioLevel || vadAudioLevel,
    partialTranscript: voice.partialTranscript,
    finalTranscript: voice.finalTranscript,
    llmText: voice.llmStreamingText,
    error: voice.error,
    start,
    stop,
    startRecording: startRecordingPTT,
    stopRecording: stopRecordingPTT,
    interrupt: handleInterrupt,
  };
}
