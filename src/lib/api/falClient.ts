// Module: api/falClient
// Responsibility: Client-side wrapper for Fal.AI voice API calls via proxy routes

import { STT_ENDPOINT, TTS_ENDPOINT } from '@/lib/voice/constants';
import { ensureSttCompatibleAudio } from '@/lib/voice/audioConversion';
import type { TTSRequest } from '@/lib/voice/types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type STTResult = {
  text: string;
  requestId?: string;
};

export type TTSResult = {
  audioUrl: string;
  durationMs?: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Speech-to-Text
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transcribe audio to text using the STT API
 * Returns the transcribed text (or empty string if no speech detected)
 */
export async function transcribeAudioSync(
  audioBlob: Blob,
  signal?: AbortSignal
): Promise<string> {
  // Convert to a model-accepted format (webm → wav) when needed
  const { blob: sttBlob, mimeType } = await ensureSttCompatibleAudio(audioBlob);

  const formData = new FormData();
  const ext = mimeType.split('/')[1]?.split(';')[0] || 'webm';
  formData.append('audio', sttBlob, `recording.${ext}`);
  formData.append('mimeType', mimeType);

  try {
    const response = await fetch(STT_ENDPOINT, {
      method: 'POST',
      body: formData,
      signal,
    });

    // Parse response
    const data = await response.json();

    // Handle error responses
    if (!response.ok && !data.text) {
      throw new Error(data.error || `STT request failed: ${response.status}`);
    }

    // Return text (may be empty string if no speech detected)
    return data.text || '';
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      // Request was aborted
      return '';
    }
    throw error;
  }
}

/**
 * Legacy callback-based API for backwards compatibility
 * @deprecated Use transcribeAudioSync instead
 */
export type STTStreamCallbacks = {
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (error: Error) => void;
  onDone?: () => void;
};

/**
 * Legacy transcription function with callbacks
 * @deprecated Use transcribeAudioSync instead
 */
export async function transcribeAudio(
  audioBlob: Blob,
  callbacks: STTStreamCallbacks,
  signal?: AbortSignal
): Promise<void> {
  try {
    const text = await transcribeAudioSync(audioBlob, signal);
    if (text) {
      callbacks.onFinal?.(text);
    }
    callbacks.onDone?.();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      callbacks.onDone?.();
      return;
    }
    callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Text-to-Speech
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate speech from text via TTS endpoint
 * Returns URL to audio file
 */
export async function synthesizeSpeech(
  request: TTSRequest,
  signal?: AbortSignal
): Promise<TTSResult> {
  const response = await fetch(TTS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error || errorData.detail || `TTS request failed: ${response.status}`;
    throw new Error(errorMessage);
  }

  const data = await response.json();

  if (!data.audio?.url) {
    throw new Error('No audio URL in TTS response');
  }

  return {
    audioUrl: data.audio.url,
    durationMs: data.duration_ms,
  };
}

/**
 * Generate speech and get audio as ArrayBuffer for immediate playback
 */
export async function synthesizeSpeechBuffer(
  request: TTSRequest,
  signal?: AbortSignal
): Promise<{ buffer: ArrayBuffer; durationMs?: number }> {
  const result = await synthesizeSpeech(request, signal);

  if (!result.audioUrl) {
    throw new Error('No audio URL returned from TTS');
  }

  // Fetch the audio file
  const audioResponse = await fetch(result.audioUrl, { signal });
  if (!audioResponse.ok) {
    throw new Error(`Failed to fetch audio: ${audioResponse.status}`);
  }

  const buffer = await audioResponse.arrayBuffer();

  return {
    buffer,
    durationMs: result.durationMs,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Connection Pre-warming
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pre-warm connections to reduce first-request latency
 */
export async function prewarmConnections(): Promise<void> {
  // Fire off OPTIONS requests to warm up connections
  const warmup = [
    fetch(STT_ENDPOINT, { method: 'OPTIONS' }).catch(() => {}),
    fetch(TTS_ENDPOINT, { method: 'OPTIONS' }).catch(() => {}),
  ];

  await Promise.all(warmup);
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if the browser supports audio recording
 */
export function isAudioRecordingSupported(): boolean {
  return !!(
    typeof navigator !== 'undefined' &&
    navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia
  );
}

/**
 * Request microphone permission
 */
export async function requestMicrophonePermission(): Promise<MediaStream> {
  if (!isAudioRecordingSupported()) {
    throw new Error('Audio recording is not supported in this browser');
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    return stream;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'NotAllowedError') {
        throw new Error('Microphone permission denied');
      }
      if (error.name === 'NotFoundError') {
        throw new Error('No microphone found');
      }
    }
    throw error;
  }
}
