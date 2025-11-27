'use client';

// Module: hooks/useAudioPlayback
// Responsibility: Handle TTS audio playback with Web Audio API

import { useCallback, useRef, useEffect, useState } from 'react';
import { useChatStore } from '@/lib/store';
import { AUDIO_LATENCY_HINT, AUDIO_BUFFER_AHEAD } from '@/lib/voice/constants';

export interface AudioQueueItem {
  id: string;
  url: string;
  text: string;
}

export interface UseAudioPlaybackResult {
  /** Whether audio is currently playing */
  isPlaying: boolean;
  /** Current playback progress 0-1 */
  progress: number;
  /** Queue an audio item for playback */
  queueAudio: (item: AudioQueueItem) => void;
  /** Start playing queued audio */
  play: () => Promise<void>;
  /** Pause playback */
  pause: () => void;
  /** Stop and clear queue */
  stop: () => void;
  /** Skip to next item */
  next: () => void;
  /** Get queue length */
  queueLength: number;
}

/**
 * Hook for handling TTS audio playback with queue management
 */
export function useAudioPlayback(): UseAudioPlaybackResult {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [queueLength, setQueueLength] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const queueRef = useRef<AudioQueueItem[]>([]);
  const currentIndexRef = useRef(0);
  const bufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map());
  const isPlayingRef = useRef(false);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const durationRef = useRef(0);

  const { setIsPlaying: setStoreIsPlaying, setVoiceMode } = useChatStore();

  // Initialize AudioContext lazily
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({
        latencyHint: AUDIO_LATENCY_HINT,
      });
    }
    return audioContextRef.current;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      if (currentSourceRef.current) {
        currentSourceRef.current.stop();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  /**
   * Fetch and decode audio buffer
   */
  const fetchAudioBuffer = useCallback(
    async (url: string): Promise<AudioBuffer> => {
      // Check cache first
      const cached = bufferCacheRef.current.get(url);
      if (cached) {
        return cached;
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const audioContext = getAudioContext();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      // Cache the buffer
      bufferCacheRef.current.set(url, audioBuffer);

      return audioBuffer;
    },
    [getAudioContext]
  );

  /**
   * Pre-fetch upcoming audio items
   */
  const prefetchUpcoming = useCallback(async () => {
    const startIndex = currentIndexRef.current;
    const endIndex = Math.min(startIndex + AUDIO_BUFFER_AHEAD, queueRef.current.length);

    for (let i = startIndex; i < endIndex; i++) {
      const item = queueRef.current[i];
      if (item && !bufferCacheRef.current.has(item.url)) {
        // Fetch in background, don't await
        fetchAudioBuffer(item.url).catch(() => {});
      }
    }
  }, [fetchAudioBuffer]);

  /**
   * Play the next item in the queue
   */
  const playNext = useCallback(async () => {
    if (currentIndexRef.current >= queueRef.current.length) {
      // Queue exhausted
      isPlayingRef.current = false;
      setIsPlaying(false);
      setStoreIsPlaying(false);
      setProgress(0);
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      return;
    }

    const item = queueRef.current[currentIndexRef.current];
    if (!item) return;

    try {
      const audioContext = getAudioContext();

      // Resume context if suspended
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const audioBuffer = await fetchAudioBuffer(item.url);

      // Create source node
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);

      // Store reference for stopping
      currentSourceRef.current = source;
      durationRef.current = audioBuffer.duration;
      startTimeRef.current = audioContext.currentTime;

      // Set up progress tracking
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      progressIntervalRef.current = setInterval(() => {
        if (!isPlayingRef.current) return;
        const elapsed = audioContext.currentTime - startTimeRef.current;
        const prog = Math.min(1, elapsed / durationRef.current);
        setProgress(prog);
      }, 50);

      // Handle end of playback
      source.onended = () => {
        currentIndexRef.current++;
        // Start next item
        if (isPlayingRef.current) {
          playNext();
        }
      };

      // Start playback
      source.start(0);

      // Pre-fetch upcoming items
      prefetchUpcoming();
    } catch (error) {
      console.error('Audio playback error:', error);
      // Skip to next item on error
      currentIndexRef.current++;
      if (isPlayingRef.current) {
        playNext();
      }
    }
  }, [getAudioContext, fetchAudioBuffer, prefetchUpcoming, setStoreIsPlaying]);

  /**
   * Queue an audio item for playback
   */
  const queueAudio = useCallback(
    (item: AudioQueueItem) => {
      queueRef.current.push(item);
      setQueueLength(queueRef.current.length);

      // Pre-fetch if we have enough items
      if (queueRef.current.length >= AUDIO_BUFFER_AHEAD) {
        prefetchUpcoming();
      }

      // Auto-start if not already playing and we have enough buffered
      if (!isPlayingRef.current && queueRef.current.length >= AUDIO_BUFFER_AHEAD) {
        play();
      }
    },
    [prefetchUpcoming]
  );

  /**
   * Start playing queued audio
   */
  const play = useCallback(async () => {
    if (isPlayingRef.current) return;
    if (queueRef.current.length === 0) return;

    isPlayingRef.current = true;
    setIsPlaying(true);
    setStoreIsPlaying(true);
    setVoiceMode('speaking');

    await playNext();
  }, [playNext, setStoreIsPlaying, setVoiceMode]);

  /**
   * Pause playback
   */
  const pause = useCallback(() => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    setStoreIsPlaying(false);

    if (currentSourceRef.current) {
      currentSourceRef.current.stop();
      currentSourceRef.current = null;
    }

    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, [setStoreIsPlaying]);

  /**
   * Stop and clear queue
   */
  const stop = useCallback(() => {
    pause();
    queueRef.current = [];
    currentIndexRef.current = 0;
    bufferCacheRef.current.clear();
    setQueueLength(0);
    setProgress(0);
  }, [pause]);

  /**
   * Skip to next item
   */
  const next = useCallback(() => {
    if (currentSourceRef.current) {
      currentSourceRef.current.stop();
      currentSourceRef.current = null;
    }
    currentIndexRef.current++;
    if (isPlayingRef.current) {
      playNext();
    }
  }, [playNext]);

  return {
    isPlaying,
    progress,
    queueAudio,
    play,
    pause,
    stop,
    next,
    queueLength,
  };
}
