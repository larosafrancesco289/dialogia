'use client';

// Module: hooks/useVoicePipeline
// Responsibility: Orchestrate the voice agent pipeline: STT → LLM → TTS

import { useCallback, useRef, useEffect, useState } from 'react';
import { useChatStore } from '@/lib/store';
import { useVoiceRecording } from './useVoiceRecording';
import { useAudioPlayback } from './useAudioPlayback';
import { useVAD } from './useVAD';
import { transcribeAudioSync, synthesizeSpeech, prewarmConnections } from '@/lib/api/falClient';
import { createSentenceChunkerStream } from '@/lib/voice/sentenceChunker';
import {
  VOICE_LLM_CONFIG,
  VOICE_AGENT_SYSTEM_PROMPT,
  MIN_AUDIO_BLOB_SIZE,
  INTERRUPT_COOLDOWN_MS,
} from '@/lib/voice/constants';
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
  /** Current dB level (for debugging) */
  currentDb: number;
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
  /** Stop voice mode completely */
  stop: () => void;
  /** Start recording (push-to-talk) */
  startRecording: () => Promise<void>;
  /** Stop recording and process */
  stopRecording: () => Promise<void>;
  /** Manually finish recording and process (for manual "done" button) */
  finishRecording: () => Promise<void>;
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
    clearVoiceError,
  } = useChatStore();

  // Recording hook - will receive shared stream
  const recording = useVoiceRecording();
  const {
    startRecording: beginRecordingInternal,
    stopRecording: endRecording,
    cancelRecording,
    isRecording,
    isValidDuration,
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

  // Cooldown state to prevent immediate re-recording after interrupt
  const [isInCooldown, setIsInCooldown] = useState(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs to hold functions to avoid circular dependency with VAD callbacks
  const beginRecordingRef = useRef<(() => Promise<void>) | null>(null);
  const handleInterruptRef = useRef<(() => void) | null>(null);

  // VAD for interruption detection during playback and automatic recording end
  const vad = useVAD({
    sensitivity: voice.voiceConfig.vadSensitivity,
    silenceThresholdMs: voice.voiceConfig.silenceThresholdMs,
    onSpeechStart: () => {
      // If playing audio and user starts speaking, interrupt
      if (voice.voiceMode === 'speaking' || isAudioPlaying) {
        handleInterruptRef.current?.();
      }
    },
    onTimeout: () => {
      // Listening timed out without valid speech - restart recording
      console.log('Voice pipeline: VAD timeout, restarting recording');
      if (isRecording) {
        cancelRecording();
      }
      // Small delay then restart
      setTimeout(() => {
        if (voice.voiceConfig.inputMode === 'vad' && voice.voiceMode !== 'idle') {
          beginRecordingRef.current?.().catch(console.error);
        }
      }, 200);
    },
  });
  const {
    start: startVad,
    stop: stopVad,
    reset: resetVad,
    isSpeaking: vadIsSpeaking,
    hasValidSpeech: vadHasValidSpeech,
    audioLevel: vadAudioLevel,
    currentDb: vadCurrentDb,
  } = vad;

  // Wrapper to pass shared stream to recording
  const beginRecording = useCallback(async () => {
    console.log('beginRecording called:', {
      hasStream: !!streamRef.current,
      streamActive: streamRef.current?.active,
      trackCount: streamRef.current?.getAudioTracks().length,
      trackStates: streamRef.current?.getAudioTracks().map(t => ({ enabled: t.enabled, readyState: t.readyState })),
    });
    
    // Check if stream is still valid
    if (streamRef.current) {
      const tracks = streamRef.current.getAudioTracks();
      const hasLiveTracks = tracks.some(t => t.readyState === 'live');
      
      if (hasLiveTracks) {
        console.log('Using existing stream for recording');
        await beginRecordingInternal(streamRef.current);
      } else {
        console.log('Stream tracks are ended, requesting new stream');
        // Stream is dead, need to request new one
        try {
          streamRef.current = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
          // Also restart VAD with new stream
          await startVad(streamRef.current);
          await beginRecordingInternal(streamRef.current);
        } catch (err) {
          console.error('Failed to get new microphone stream:', err);
          throw err;
        }
      }
    } else {
      console.log('No stream, requesting new microphone access');
      await beginRecordingInternal();
    }
  }, [beginRecordingInternal, startVad]);

  // Update beginRecording ref (handleInterrupt ref updated later after it's defined)
  useEffect(() => {
    beginRecordingRef.current = beginRecording;
  }, [beginRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortAll();
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
      }
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
   * Start cooldown period
   */
  const startCooldown = useCallback(() => {
    setIsInCooldown(true);
    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current);
    }
    cooldownTimerRef.current = setTimeout(() => {
      setIsInCooldown(false);
      cooldownTimerRef.current = null;
    }, INTERRUPT_COOLDOWN_MS);
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
    resetVad();

    // Start cooldown to prevent immediate re-recording
    startCooldown();

    // Set interrupted mode
    setVoiceMode('interrupted');

    // Resume to appropriate mode after cooldown
    setTimeout(() => {
      if (voice.voiceConfig.inputMode === 'vad') {
        setVoiceMode('listening');
        // Restart recording after cooldown
        beginRecording().catch((err) => {
          console.error('Failed to restart recording:', err);
        });
      } else {
        setVoiceMode('idle');
      }
    }, INTERRUPT_COOLDOWN_MS);
  }, [
    abortAll,
    stopPlayback,
    interruptPlayback,
    resetVad,
    startCooldown,
    voice.voiceConfig.inputMode,
    setVoiceMode,
    beginRecording,
  ]);

  // Update handleInterrupt ref (defined after the function to avoid initialization order issues)
  useEffect(() => {
    handleInterruptRef.current = handleInterrupt;
  }, [handleInterrupt]);

  /**
   * Process audio through the pipeline: STT → LLM → TTS
   */
  const processPipeline = useCallback(
    async (audioBlob: Blob) => {
      if (isProcessingRef.current) {
        console.log('Pipeline already processing, skipping');
        return;
      }

      // Validate blob size
      if (audioBlob.size < MIN_AUDIO_BLOB_SIZE) {
        console.log(`Audio blob too small (${audioBlob.size} bytes), skipping`);
        // Return to listening mode in VAD, idle in PTT
        const nextMode = voice.voiceConfig.inputMode === 'vad' ? 'listening' : 'idle';
        setVoiceMode(nextMode);
        if (nextMode === 'listening' && !isRecording) {
          beginRecording().catch(console.error);
        }
        return;
      }

      isProcessingRef.current = true;
      clearVoiceError();

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

        // Use synchronous transcription (no streaming needed for complete audio)
        const finalText = await transcribeAudioSync(
          audioBlob,
          controllersRef.current.stt?.signal
        );

        if (!finalText.trim()) {
          // No speech detected - return to listening/idle
          console.log('No speech detected in audio');
          const nextMode = voice.voiceConfig.inputMode === 'vad' ? 'listening' : 'idle';
          setVoiceMode(nextMode);
          isProcessingRef.current = false;

          if (nextMode === 'listening' && !isRecording) {
            beginRecording().catch(console.error);
          }
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
          // No audio to play, go back to listening/idle
          const nextMode = voice.voiceConfig.inputMode === 'vad' ? 'listening' : 'idle';
          setVoiceMode(nextMode);
          if (nextMode === 'listening' && !isRecording) {
            beginRecording().catch(console.error);
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

        // On error, return to listening mode in VAD so user can try again
        // Don't just go idle - that leaves the user stuck
        const nextMode = voice.voiceConfig.inputMode === 'vad' ? 'listening' : 'idle';
        setVoiceMode(nextMode);
        
        // Reset VAD and restart recording so user can try again
        if (nextMode === 'listening') {
          resetVad();
          setTimeout(() => {
            beginRecording().catch((restartErr) => {
              console.error('Failed to restart recording after error:', restartErr);
            });
          }, 200);
        }
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
      clearVoiceError,
      voice.voiceConfig,
      isAudioPlaying,
      playbackQueueLength,
      playAudio,
      queueAudio,
      beginRecording,
      isRecording,
      resetVad,
    ]
  );

  /**
   * Start voice mode
   */
  const start = useCallback(async () => {
    // Pre-warm connections
    prewarmConnections();
    clearVoiceError();

    console.log('Voice Pipeline: Starting...');

    // Request microphone permission
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Log stream info
      const tracks = streamRef.current.getAudioTracks();
      console.log('Voice Pipeline: Got stream with', tracks.length, 'audio tracks');
      if (tracks.length > 0) {
        const track = tracks[0];
        console.log('Voice Pipeline: Track settings:', track.getSettings());
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.name === 'NotAllowedError'
            ? 'Microphone permission denied'
            : err.message
          : 'Microphone error';
      console.error('Voice Pipeline: Microphone error:', message);
      setVoiceError(message);
      return;
    }

    startVoiceMode();

    // Start VAD monitoring for interruption detection
    if (streamRef.current) {
      console.log('Voice Pipeline: Starting VAD...');
      await startVad(streamRef.current);
    }

    // In VAD mode, start recording immediately
    if (voice.voiceConfig.inputMode === 'vad') {
      setVoiceMode('listening');
      console.log('Voice Pipeline: Starting recording (VAD mode)...');
      await beginRecording();
    }

    console.log('Voice Pipeline: Started successfully');
  }, [startVoiceMode, setVoiceError, clearVoiceError, voice.voiceConfig.inputMode, beginRecording, startVad, setVoiceMode]);

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

    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
    setIsInCooldown(false);

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
    if (isInCooldown) return;

    clearVoiceError();
    await beginRecording();
    setVoiceMode('listening');
  }, [voice.voiceConfig.inputMode, isInCooldown, beginRecording, setVoiceMode, clearVoiceError]);

  /**
   * Stop recording and process (push-to-talk mode)
   */
  const stopRecordingPTT = useCallback(async () => {
    const audioBlob = await endRecording();
    if (audioBlob) {
      await processPipeline(audioBlob);
    } else {
      // Recording was invalid (too short), return to idle
      setVoiceMode('idle');
    }
  }, [endRecording, processPipeline, setVoiceMode]);

  /**
   * Manually finish recording and process (for "Done Speaking" button)
   * Works in any input mode
   */
  const finishRecording = useCallback(async () => {
    console.log('finishRecording called:', {
      isRecording,
      recordingState: recording.state,
      voiceMode: voice.voiceMode,
    });
    
    if (!isRecording) {
      console.log('finishRecording: Not recording, ignoring. Recording state:', recording.state);
      return;
    }

    console.log('finishRecording: Manually ending recording');
    resetVad(); // Reset VAD state

    const audioBlob = await endRecording();
    if (audioBlob) {
      await processPipeline(audioBlob);
    } else {
      // Recording was invalid, go back to listening or idle
      const nextMode = voice.voiceConfig.inputMode === 'vad' ? 'listening' : 'idle';
      setVoiceMode(nextMode);
      if (nextMode === 'listening') {
        await beginRecording();
      }
    }
  }, [isRecording, recording.state, voice.voiceMode, resetVad, endRecording, processPipeline, voice.voiceConfig.inputMode, setVoiceMode, beginRecording]);

  // Handle VAD-based recording end - only when valid speech has been detected
  useEffect(() => {
    // Debug: log state changes
    console.log('VAD Effect Check:', {
      inputMode: voice.voiceConfig.inputMode,
      isInCooldown,
      vadIsSpeaking,
      isRecording,
      vadHasValidSpeech,
      isProcessing: isProcessingRef.current,
    });

    // Only process in VAD mode
    if (voice.voiceConfig.inputMode !== 'vad') {
      console.log('VAD Effect: Not in VAD mode, skipping');
      return;
    }
    // Skip during cooldown
    if (isInCooldown) {
      console.log('VAD Effect: In cooldown, skipping');
      return;
    }
    // Only when VAD was speaking but now stopped (silence detected)
    if (vadIsSpeaking) {
      console.log('VAD Effect: Still speaking, skipping');
      return;
    }
    // Only if we're currently recording
    if (!isRecording) {
      console.log('VAD Effect: Not recording, skipping');
      return;
    }
    // Only if valid speech was detected
    if (!vadHasValidSpeech) {
      console.log('VAD Effect: No valid speech detected, skipping');
      return;
    }
    // Don't process if already processing
    if (isProcessingRef.current) {
      console.log('VAD Effect: Already processing, skipping');
      return;
    }

    console.log('VAD Effect: All conditions met! Triggering auto-process');

    // Silence detected after valid speech - stop and process
    endRecording().then((blob) => {
      resetVad(); // Reset VAD for next utterance
      if (blob) {
        processPipeline(blob);
      } else {
        // No valid recording, restart listening
        setVoiceMode('listening');
        beginRecording().catch(console.error);
      }
    });
  }, [
    vadIsSpeaking,
    vadHasValidSpeech,
    voice.voiceConfig.inputMode,
    isRecording,
    isInCooldown,
    endRecording,
    processPipeline,
    resetVad,
    setVoiceMode,
    beginRecording,
  ]);

  // When playback finishes, return to listening/idle so the user can continue talking
  useEffect(() => {
    // Skip if audio is still playing
    if (isAudioPlaying) return;
    // Skip if processing
    if (isProcessingRef.current) return;
    // Skip if in cooldown
    if (isInCooldown) return;
    // Only transition from speaking/processing modes
    if (voice.voiceMode !== 'speaking' && voice.voiceMode !== 'processing') return;

    console.log('Playback finished, transitioning to next mode. Current state:', {
      isRecording,
      voiceMode: voice.voiceMode,
      inputMode: voice.voiceConfig.inputMode,
      hasStream: !!streamRef.current,
      streamActive: streamRef.current?.active,
    });

    const nextMode = voice.voiceConfig.inputMode === 'vad' ? 'listening' : 'idle';
    setVoiceMode(nextMode);

    if (nextMode === 'listening') {
      // IMPORTANT: Reset VAD state before starting new recording cycle
      // This clears hasValidSpeech from the previous turn
      resetVad();
      
      // Small delay to ensure state has settled before starting recording
      setTimeout(() => {
        console.log('Starting new recording cycle after playback');
        beginRecording().catch((err) => {
          console.error('Failed to restart recording after playback:', err);
          const message = err instanceof Error ? err.message : 'Microphone error';
          setVoiceError(message);
        });
      }, 100);
    }
  }, [
    isAudioPlaying,
    voice.voiceMode,
    voice.voiceConfig.inputMode,
    resetVad,
    isRecording,
    isInCooldown,
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
    currentDb: vadCurrentDb,
    partialTranscript: voice.partialTranscript,
    finalTranscript: voice.finalTranscript,
    llmText: voice.llmStreamingText,
    error: voice.error,
    start,
    stop,
    startRecording: startRecordingPTT,
    stopRecording: stopRecordingPTT,
    finishRecording,
    interrupt: handleInterrupt,
  };
}
