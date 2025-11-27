'use client';

// Module: hooks/useVoiceRecording
// Responsibility: Handle microphone recording with MediaRecorder API

import { useCallback, useRef, useState, useEffect } from 'react';
import { useChatStore } from '@/lib/store';
import {
  PREFERRED_AUDIO_FORMAT,
  SUPPORTED_AUDIO_FORMATS,
  MAX_RECORDING_DURATION_MS,
  MIN_RECORDING_DURATION_MS,
  MIN_AUDIO_BLOB_SIZE,
} from '@/lib/voice/constants';

export type RecordingState = 'idle' | 'requesting' | 'recording' | 'stopping' | 'error';

export interface UseVoiceRecordingOptions {
  /** External stream to use (if provided, won't request new microphone access) */
  externalStream?: MediaStream | null;
}

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
  /** Whether recording meets minimum duration for processing */
  isValidDuration: boolean;
  /** Start recording (optionally with external stream) */
  startRecording: (stream?: MediaStream) => Promise<void>;
  /** Stop recording and return audio blob (returns null if too short or empty) */
  stopRecording: () => Promise<Blob | null>;
  /** Cancel recording without returning data */
  cancelRecording: () => void;
}

/**
 * Hook for handling microphone recording with MediaRecorder API
 * Includes minimum duration and blob size validation
 */
export function useVoiceRecording(options: UseVoiceRecordingOptions = {}): UseVoiceRecordingResult {
  const { externalStream } = options;
  
  const [state, setState] = useState<RecordingState>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ownsStreamRef = useRef(false); // Track if we created the stream
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const levelAnimationRef = useRef<number>(0);
  const resolveStopRef = useRef<((blob: Blob | null) => void) | null>(null);
  const mimeTypeRef = useRef<string>(PREFERRED_AUDIO_FORMAT);

  const { setAudioLevel: setStoreAudioLevel, setRecordingDuration } = useChatStore();

  // Whether recording meets minimum duration
  const isValidDuration = durationMs >= MIN_RECORDING_DURATION_MS;

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

    // Only stop stream tracks if we own the stream
    if (streamRef.current && ownsStreamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    streamRef.current = null;
    ownsStreamRef.current = false;

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
   * Validate audio blob - returns true if blob is valid for processing
   */
  const validateBlob = useCallback((blob: Blob, recordingDuration: number): boolean => {
    // Check minimum size
    if (blob.size < MIN_AUDIO_BLOB_SIZE) {
      console.log(`Recording rejected: blob size ${blob.size} < ${MIN_AUDIO_BLOB_SIZE}`);
      return false;
    }

    // Check minimum duration
    if (recordingDuration < MIN_RECORDING_DURATION_MS) {
      console.log(
        `Recording rejected: duration ${recordingDuration}ms < ${MIN_RECORDING_DURATION_MS}ms`
      );
      return false;
    }

    return true;
  }, []);

  /**
   * Start recording from microphone
   * @param stream Optional external stream to use instead of requesting new microphone access
   */
  const startRecording = useCallback(async (stream?: MediaStream) => {
    console.log('startRecording called, current state:', state);
    
    // If already recording or in process, don't start again
    if (state === 'recording' || state === 'requesting' || state === 'stopping') {
      console.log('startRecording: Skipping - already in state:', state);
      return;
    }

    // Clean up any previous state first
    cleanup();

    setState('requesting');
    setError(null);
    setDurationMs(0);
    chunksRef.current = [];

    try {
      // Use provided stream, external stream from options, or request new one
      let activeStream = stream || externalStream;
      
      if (activeStream) {
        // Use provided stream - don't own it
        streamRef.current = activeStream;
        ownsStreamRef.current = false;
        console.log('Recording: Using provided stream');
      } else {
        // Request microphone access
        console.log('Recording: Requesting new microphone stream');
        activeStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        streamRef.current = activeStream;
        ownsStreamRef.current = true;
      }

      // Verify stream has audio tracks
      const audioTracks = activeStream.getAudioTracks();
      if (audioTracks.length === 0) {
        throw new Error('No audio tracks in stream');
      }
      console.log('Recording: Audio tracks:', audioTracks.length, 'enabled:', audioTracks[0]?.enabled);

      // Set up audio analysis for level monitoring
      audioContextRef.current = new AudioContext();
      
      // Resume AudioContext if suspended
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      const source = audioContextRef.current.createMediaStreamSource(activeStream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      // Create MediaRecorder
      const mimeType = getSupportedMimeType();
      mimeTypeRef.current = mimeType;
      const mediaRecorder = new MediaRecorder(activeStream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      // Collect data chunks
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      // Handle stop
      mediaRecorder.onstop = () => {
        const recordingDuration = Date.now() - startTimeRef.current;
        const blob = new Blob(chunksRef.current, { type: mimeType });

        if (resolveStopRef.current) {
          // Validate before returning
          if (validateBlob(blob, recordingDuration)) {
            resolveStopRef.current(blob);
          } else {
            resolveStopRef.current(null);
          }
          resolveStopRef.current = null;
        }
        cleanup();
        setState('idle');
      };

      // Handle errors
      mediaRecorder.onerror = (event) => {
        const errorMessage = (event as any).error?.message || 'Recording failed';
        console.error('MediaRecorder error:', errorMessage);
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
      console.log('Recording: Started, AudioContext state:', audioContextRef.current.state);

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

      console.error('Recording start error:', errorMessage);
      setError(errorMessage);
      setState('error');
      cleanup();
    }
  }, [
    state,
    externalStream,
    getSupportedMimeType,
    monitorAudioLevel,
    cleanup,
    setRecordingDuration,
    validateBlob,
  ]);

  /**
   * Stop recording and return audio blob
   * Returns null if recording was too short or blob is too small
   */
  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    if (state !== 'recording' || !mediaRecorderRef.current) {
      return null;
    }

    setState('stopping');

    return new Promise((resolve) => {
      resolveStopRef.current = resolve;

      // Request final data before stopping
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.requestData();
        mediaRecorderRef.current.stop();
      } else {
        // If not recording, resolve immediately with null
        resolve(null);
      }
    });
  }, [state]);

  /**
   * Cancel recording without returning data
   */
  const cancelRecording = useCallback(() => {
    // Stop MediaRecorder if it's running
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }

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
    isValidDuration,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
