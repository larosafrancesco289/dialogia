'use client';

// Module: hooks/useVAD
// Responsibility: Voice Activity Detection using Web Audio API

import { useCallback, useRef, useEffect, useState } from 'react';
import { VAD_THRESHOLDS, VAD_SILENCE_DURATION } from '@/lib/voice/constants';
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
  /** Start VAD monitoring on a stream */
  start: (stream: MediaStream) => void;
  /** Stop VAD monitoring */
  stop: () => void;
}

/**
 * Hook for Voice Activity Detection using Web Audio API
 */
export function useVAD(options: UseVADOptions = {}): UseVADResult {
  const {
    sensitivity = 'medium',
    silenceThresholdMs,
    onSpeechStart,
    onSpeechEnd,
    onAudioLevel,
  } = options;

  const [isActive, setIsActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number>(0);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSpeakingRef = useRef(false);

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
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
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

    // Convert to dB
    const db = rms > 0 ? 20 * Math.log10(rms) : -100;

    // Normalize level for visualization (0-1)
    const normalizedLevel = Math.max(0, Math.min(1, (db + 60) / 60));
    setAudioLevel(normalizedLevel);
    onAudioLevel?.(normalizedLevel);

    const threshold = getThreshold();
    const isSpeechDetected = db > threshold;

    if (isSpeechDetected) {
      // Clear silence timer if speech detected
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }

      // Trigger speech start if not already speaking
      if (!isSpeakingRef.current) {
        isSpeakingRef.current = true;
        setIsSpeaking(true);
        onSpeechStart?.();
      }
    } else if (isSpeakingRef.current) {
      // Start silence timer if not already started
      if (!silenceTimerRef.current) {
        const silenceDuration = getSilenceDuration();
        silenceTimerRef.current = setTimeout(() => {
          isSpeakingRef.current = false;
          setIsSpeaking(false);
          onSpeechEnd?.();
          silenceTimerRef.current = null;
        }, silenceDuration);
      }
    }

    // Continue monitoring
    animationFrameRef.current = requestAnimationFrame(monitor);
  }, [getThreshold, getSilenceDuration, onSpeechStart, onSpeechEnd, onAudioLevel]);

  /**
   * Start VAD monitoring on a stream
   */
  const start = useCallback(
    (stream: MediaStream) => {
      // Clean up any existing context
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }

      // Create new audio context and analyser
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 512;
      analyserRef.current.smoothingTimeConstant = 0.3;

      // Connect stream to analyser
      sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
      sourceRef.current.connect(analyserRef.current);

      setIsActive(true);
      isSpeakingRef.current = false;
      setIsSpeaking(false);

      // Start monitoring
      monitor();
    },
    [monitor]
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

    // Clear silence timer
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
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
    setAudioLevel(0);
  }, []);

  return {
    isActive,
    isSpeaking,
    audioLevel,
    start,
    stop,
  };
}
