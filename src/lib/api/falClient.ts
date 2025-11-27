// Module: api/falClient
// Responsibility: Client-side wrapper for Fal.AI voice API calls via proxy routes

import { STT_ENDPOINT, TTS_ENDPOINT } from '@/lib/voice/constants';
import type { STTEvent, TTSRequest } from '@/lib/voice/types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type STTStreamCallbacks = {
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (error: Error) => void;
  onDone?: () => void;
};

export type TTSResult = {
  audioUrl: string;
  durationMs?: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Speech-to-Text
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send audio to STT endpoint and stream transcription results
 */
export async function transcribeAudio(
  audioBlob: Blob,
  callbacks: STTStreamCallbacks,
  signal?: AbortSignal
): Promise<void> {
  const formData = new FormData();
  // Include MIME type in filename and add explicit mimeType field
  const mimeType = audioBlob.type || 'audio/webm';
  const ext = mimeType.split('/')[1] || 'webm';
  formData.append('audio', audioBlob, `recording.${ext}`);
  formData.append('mimeType', mimeType);

  try {
    const response = await fetch(STT_ENDPOINT, {
      method: 'POST',
      body: formData,
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`STT request failed: ${response.status} - ${errorText}`);
    }

    // Handle SSE stream
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') {
          callbacks.onDone?.();
          return;
        }

        try {
          const event: STTEvent = JSON.parse(data);
          if (event.partial) {
            callbacks.onPartial?.(event.partial);
          }
          if (event.final) {
            callbacks.onFinal?.(event.final);
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }

    callbacks.onDone?.();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      // Request was aborted, don't report as error
      return;
    }
    callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Non-streaming STT for shorter audio clips
 */
export async function transcribeAudioSync(
  audioBlob: Blob,
  signal?: AbortSignal
): Promise<string> {
  return new Promise((resolve, reject) => {
    let result = '';

    transcribeAudio(
      audioBlob,
      {
        onFinal: (text) => {
          result = text;
        },
        onError: reject,
        onDone: () => resolve(result),
      },
      signal
    );
  });
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
    const errorText = await response.text();
    throw new Error(`TTS request failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  return {
    audioUrl: data.audio?.url,
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
