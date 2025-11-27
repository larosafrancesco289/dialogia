'use client';

// Module: hooks/useVAD
// Responsibility: Voice Activity Detection using Web Audio API

import { useCallback, useRef, useEffect, useState } from 'react';
import {
  VAD_THRESHOLDS,
  VAD_SILENCE_DURATION,
  MIN_SPEECH_DURATION_MS,
  SPEECH_START_DEBOUNCE_MS,
  MAX_LISTEN_WITHOUT_SPEECH_MS,
} from '@/lib/voice/constants';
import type { VADSensitivity } from '@/lib/voice/types';

export interface UseVADOptions {
  /** Sensitivity level */
  sensitivity?: VADSensitivity;
  /** Override silence threshold in ms */
  silenceThresholdMs?: number;
  /** Callback when speech starts */
  onSpeechStart?: () => void;
  /** Callback when speech ends (silence detected) */
  onSpeechEnd?: () => void;
  /** Callback when listening times out without valid speech */
  onTimeout?: () => void;
  /** Callback with current audio level (0-1) */
  onAudioLevel?: (level: number) => void;
}

export interface UseVADResult {
  /** Whether VAD is currently active */
  isActive: boolean;
  /** Whether speech is currently detected */
  isSpeaking: boolean;
  /** Current audio level 0-1 */
  audioLevel: number;
  /** Duration of current speech in ms (0 if not speaking) */
  speechDurationMs: number;
  /** Whether enough speech has been detected for valid utterance */
  hasValidSpeech: boolean;
  /** Current dB level (for debugging) */
  currentDb: number;
  /** Start VAD monitoring on a stream */
  start: (stream: MediaStream) => void;
  /** Stop VAD monitoring */
  stop: () => void;
  /** Reset speech tracking (useful after processing) */
  reset: () => void;
}

/**
 * Hook for Voice Activity Detection using Web Audio API
 * Includes minimum speech duration gates, debouncing, and timeout protection
 */
export function useVAD(options: UseVADOptions = {}): UseVADResult {
  const {
    sensitivity = 'medium',
    silenceThresholdMs,
    onSpeechStart,
    onSpeechEnd,
    onTimeout,
    onAudioLevel,
  } = options;

  const [isActive, setIsActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [speechDurationMs, setSpeechDurationMs] = useState(0);
  const [hasValidSpeech, setHasValidSpeech] = useState(false);
  const [currentDb, setCurrentDb] = useState(-100);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number>(0);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechStartDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSpeakingRef = useRef(false);
  const speechStartTimeRef = useRef<number | null>(null);
  const hasValidSpeechRef = useRef(false);
  const listenStartTimeRef = useRef<number | null>(null);

  // Get threshold based on sensitivity
  const getThreshold = useCallback(() => {
    return VAD_THRESHOLDS[sensitivity];
  }, [sensitivity]);

  // Get silence duration based on sensitivity
  const getSilenceDuration = useCallback(() => {
    if (silenceThresholdMs !== undefined) {
      return silenceThresholdMs;
    }
    return VAD_SILENCE_DURATION[sensitivity];
  }, [sensitivity, silenceThresholdMs]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      if (speechStartDebounceRef.current) {
        clearTimeout(speechStartDebounceRef.current);
      }
      if (timeoutTimerRef.current) {
        clearTimeout(timeoutTimerRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  /**
   * Reset speech tracking state
   */
  const reset = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (speechStartDebounceRef.current) {
      clearTimeout(speechStartDebounceRef.current);
      speechStartDebounceRef.current = null;
    }
    if (timeoutTimerRef.current) {
      clearTimeout(timeoutTimerRef.current);
      timeoutTimerRef.current = null;
    }
    isSpeakingRef.current = false;
    speechStartTimeRef.current = null;
    hasValidSpeechRef.current = false;
    listenStartTimeRef.current = Date.now();
    setIsSpeaking(false);
    setSpeechDurationMs(0);
    setHasValidSpeech(false);
  }, []);

  /**
   * Monitor audio level and detect speech
   */
  const monitor = useCallback(() => {
    if (!analyserRef.current) return;

    const dataArray = new Float32Array(analyserRef.current.fftSize);
    analyserRef.current.getFloatTimeDomainData(dataArray);

    // Calculate RMS
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sum / dataArray.length);

    // Convert to dB (clamp to reasonable range)
    const db = rms > 0.0001 ? 20 * Math.log10(rms) : -100;
    setCurrentDb(db);

    // Normalize level for visualization (0-1)
    // Map -60dB to 0dB range to 0-1
    const normalizedLevel = Math.max(0, Math.min(1, (db + 60) / 60));
    setAudioLevel(normalizedLevel);
    onAudioLevel?.(normalizedLevel);

    const threshold = getThreshold();
    const isSpeechDetected = db > threshold;

    // Check for timeout - if listening too long without valid speech, trigger timeout
    if (listenStartTimeRef.current && !hasValidSpeechRef.current) {
      const listenDuration = Date.now() - listenStartTimeRef.current;
      if (listenDuration > MAX_LISTEN_WITHOUT_SPEECH_MS) {
        console.log('VAD: Timeout - no valid speech detected');
        // Reset and trigger timeout callback
        isSpeakingRef.current = false;
        setIsSpeaking(false);
        speechStartTimeRef.current = null;
        listenStartTimeRef.current = Date.now(); // Reset for next attempt
        onTimeout?.();
        // Continue monitoring
        animationFrameRef.current = requestAnimationFrame(monitor);
        return;
      }
    }

    if (isSpeechDetected) {
      // Clear silence timer if speech detected
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }

      // Trigger speech start with debounce
      if (!isSpeakingRef.current && !speechStartDebounceRef.current) {
        speechStartDebounceRef.current = setTimeout(() => {
          speechStartDebounceRef.current = null;
          if (!isSpeakingRef.current) {
            isSpeakingRef.current = true;
            speechStartTimeRef.current = Date.now();
            setIsSpeaking(true);
            onSpeechStart?.();
          }
        }, SPEECH_START_DEBOUNCE_MS);
      }

      // Update speech duration if speaking
      if (isSpeakingRef.current && speechStartTimeRef.current) {
        const duration = Date.now() - speechStartTimeRef.current;
        setSpeechDurationMs(duration);

        // Mark as valid speech once minimum duration is reached
        if (duration >= MIN_SPEECH_DURATION_MS && !hasValidSpeechRef.current) {
          hasValidSpeechRef.current = true;
          setHasValidSpeech(true);
          console.log('VAD: Valid speech detected');
        }
      }
    } else {
      // Silence detected
      
      // Cancel speech start debounce if silence detected before it fires
      if (speechStartDebounceRef.current) {
        clearTimeout(speechStartDebounceRef.current);
        speechStartDebounceRef.current = null;
      }

      if (isSpeakingRef.current) {
        // Start silence timer if not already started
        if (!silenceTimerRef.current) {
          const silenceDuration = getSilenceDuration();
          silenceTimerRef.current = setTimeout(() => {
            const hadValidSpeech = hasValidSpeechRef.current;
            console.log('VAD: Silence detected, ending speech. Valid:', hadValidSpeech);
            
            // IMPORTANT: Set isSpeaking to false BEFORE resetting hasValidSpeech
            // This allows the consumer (useVoicePipeline) to detect the transition
            // with hasValidSpeech still being true
            isSpeakingRef.current = false;
            setIsSpeaking(false);
            silenceTimerRef.current = null;

            // Reset speech start time
            speechStartTimeRef.current = null;
            setSpeechDurationMs(0);
            listenStartTimeRef.current = Date.now(); // Reset timeout tracker

            // NOTE: We do NOT reset hasValidSpeech here!
            // The consumer should call reset() after processing the speech.
            // This fixes the race condition where hasValidSpeech was being
            // reset before the useEffect in useVoicePipeline could detect it.
            
            // Trigger callback if we had valid speech
            if (hadValidSpeech) {
              onSpeechEnd?.();
            }
          }, silenceDuration);
        }
      }
    }

    // Continue monitoring
    animationFrameRef.current = requestAnimationFrame(monitor);
  }, [getThreshold, getSilenceDuration, onSpeechStart, onSpeechEnd, onTimeout, onAudioLevel]);

  /**
   * Start VAD monitoring on a stream
   */
  const start = useCallback(
    async (stream: MediaStream) => {
      // Clean up any existing context
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }

      // Verify stream has audio tracks
      const audioTracks = stream.getAudioTracks();
      console.log('VAD: Stream audio tracks:', audioTracks.length);
      if (audioTracks.length === 0) {
        console.error('VAD: No audio tracks in stream!');
        return;
      }
      
      const track = audioTracks[0];
      console.log('VAD: Audio track -', 'enabled:', track.enabled, 'muted:', track.muted, 'readyState:', track.readyState);

      // Create new audio context and analyser
      audioContextRef.current = new AudioContext();
      console.log('VAD: Created AudioContext, initial state:', audioContextRef.current.state);
      
      // IMPORTANT: Resume AudioContext if suspended (required by browsers after user interaction)
      if (audioContextRef.current.state === 'suspended') {
        console.log('VAD: Resuming suspended AudioContext...');
        await audioContextRef.current.resume();
        console.log('VAD: AudioContext resumed, new state:', audioContextRef.current.state);
      }
      
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 512;
      analyserRef.current.smoothingTimeConstant = 0.5;

      // Connect stream to analyser
      sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
      sourceRef.current.connect(analyserRef.current);

      setIsActive(true);
      listenStartTimeRef.current = Date.now();
      reset();

      console.log('VAD: Started monitoring, threshold:', VAD_THRESHOLDS[sensitivity], 'dB');

      // Start monitoring
      monitor();
    },
    [monitor, reset, sensitivity]
  );

  /**
   * Stop VAD monitoring
   */
  const stop = useCallback(() => {
    // Cancel animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = 0;
    }

    // Clear timers
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (speechStartDebounceRef.current) {
      clearTimeout(speechStartDebounceRef.current);
      speechStartDebounceRef.current = null;
    }
    if (timeoutTimerRef.current) {
      clearTimeout(timeoutTimerRef.current);
      timeoutTimerRef.current = null;
    }

    // Disconnect source
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    setIsActive(false);
    setIsSpeaking(false);
    isSpeakingRef.current = false;
    speechStartTimeRef.current = null;
    hasValidSpeechRef.current = false;
    listenStartTimeRef.current = null;
    setSpeechDurationMs(0);
    setHasValidSpeech(false);
    setAudioLevel(0);
    setCurrentDb(-100);
  }, []);

  return {
    isActive,
    isSpeaking,
    audioLevel,
    speechDurationMs,
    hasValidSpeech,
    currentDb,
    start,
    stop,
    reset,
  };
}
