'use client';

// Module: hooks/useVoiceRecording
// Responsibility: Handle microphone recording with MediaRecorder API

import { useCallback, useRef, useState, useEffect } from 'react';
import { useChatStore } from '@/lib/store';
import {
  PREFERRED_AUDIO_FORMAT,
  SUPPORTED_AUDIO_FORMATS,
  MAX_RECORDING_DURATION_MS,
} from '@/lib/voice/constants';

export type RecordingState = 'idle' | 'requesting' | 'recording' | 'stopping' | 'error';

export interface UseVoiceRecordingResult {
  /** Current recording state */
  state: RecordingState;
  /** Whether currently recording */
  isRecording: boolean;
  /** Audio level 0-1 for visualization */
  audioLevel: number;
  /** Recording duration in ms */
  durationMs: number;
  /** Error message if any */
  error: string | null;
  /** Start recording */
  startRecording: () => Promise<void>;
  /** Stop recording and return audio blob */
  stopRecording: () => Promise<Blob | null>;
  /** Cancel recording without returning data */
  cancelRecording: () => void;
}

/**
 * Hook for handling microphone recording with MediaRecorder API
 */
export function useVoiceRecording(): UseVoiceRecordingResult {
  const [state, setState] = useState<RecordingState>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const levelAnimationRef = useRef<number>(0);
  const resolveStopRef = useRef<((blob: Blob | null) => void) | null>(null);

  const { setAudioLevel: setStoreAudioLevel, setRecordingDuration } = useChatStore();

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = useCallback(() => {
    // Stop animation frame
    if (levelAnimationRef.current) {
      cancelAnimationFrame(levelAnimationRef.current);
      levelAnimationRef.current = 0;
    }

    // Clear duration interval
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    // Stop audio context
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    // Stop media stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    analyserRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }, []);

  /**
   * Monitor audio level using Web Audio API analyser
   */
  const monitorAudioLevel = useCallback(() => {
    if (!analyserRef.current) return;

    const dataArray = new Float32Array(analyserRef.current.fftSize);
    analyserRef.current.getFloatTimeDomainData(dataArray);

    // Calculate RMS
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sum / dataArray.length);

    // Normalize to 0-1 range (RMS is typically 0-1 for audio)
    const level = Math.min(1, rms * 3); // Boost for visibility

    setAudioLevel(level);
    setStoreAudioLevel(level);

    // Continue monitoring
    levelAnimationRef.current = requestAnimationFrame(monitorAudioLevel);
  }, [setStoreAudioLevel]);

  /**
   * Get the best supported audio format
   */
  const getSupportedMimeType = useCallback((): string => {
    if (typeof MediaRecorder === 'undefined') {
      return PREFERRED_AUDIO_FORMAT;
    }

    for (const format of SUPPORTED_AUDIO_FORMATS) {
      if (MediaRecorder.isTypeSupported(format)) {
        return format;
      }
    }

    return PREFERRED_AUDIO_FORMAT;
  }, []);

  /**
   * Start recording from microphone
   */
  const startRecording = useCallback(async () => {
    if (state === 'recording' || state === 'requesting') {
      return;
    }

    setState('requesting');
    setError(null);
    setDurationMs(0);
    chunksRef.current = [];

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;

      // Set up audio analysis for level monitoring
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      // Create MediaRecorder
      const mimeType = getSupportedMimeType();
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      // Collect data chunks
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      // Handle stop
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (resolveStopRef.current) {
          resolveStopRef.current(blob);
          resolveStopRef.current = null;
        }
        cleanup();
        setState('idle');
      };

      // Handle errors
      mediaRecorder.onerror = (event) => {
        const errorMessage = (event as any).error?.message || 'Recording failed';
        setError(errorMessage);
        setState('error');
        if (resolveStopRef.current) {
          resolveStopRef.current(null);
          resolveStopRef.current = null;
        }
        cleanup();
      };

      // Start recording
      mediaRecorder.start(100); // Collect data every 100ms
      startTimeRef.current = Date.now();
      setState('recording');

      // Start monitoring audio level
      monitorAudioLevel();

      // Start duration tracking
      durationIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current;
        setDurationMs(elapsed);
        setRecordingDuration(elapsed);

        // Auto-stop at max duration
        if (elapsed >= MAX_RECORDING_DURATION_MS) {
          stopRecording();
        }
      }, 100);
    } catch (err) {
      let errorMessage = 'Failed to access microphone';

      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          errorMessage = 'Microphone permission denied';
        } else if (err.name === 'NotFoundError') {
          errorMessage = 'No microphone found';
        } else {
          errorMessage = err.message;
        }
      }

      setError(errorMessage);
      setState('error');
      cleanup();
    }
  }, [state, getSupportedMimeType, monitorAudioLevel, cleanup, setRecordingDuration]);

  /**
   * Stop recording and return audio blob
   */
  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    if (state !== 'recording' || !mediaRecorderRef.current) {
      return null;
    }

    setState('stopping');

    return new Promise((resolve) => {
      resolveStopRef.current = resolve;
      mediaRecorderRef.current?.stop();
    });
  }, [state]);

  /**
   * Cancel recording without returning data
   */
  const cancelRecording = useCallback(() => {
    if (resolveStopRef.current) {
      resolveStopRef.current(null);
      resolveStopRef.current = null;
    }
    cleanup();
    setState('idle');
    setDurationMs(0);
    setAudioLevel(0);
    setStoreAudioLevel(0);
    setRecordingDuration(0);
  }, [cleanup, setStoreAudioLevel, setRecordingDuration]);

  return {
    state,
    isRecording: state === 'recording',
    audioLevel,
    durationMs,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
