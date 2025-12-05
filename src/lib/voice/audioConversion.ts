// Module: voice/audioConversion
// Responsibility: Normalize recorded audio into an STT-compatible format

import { AUDIO_SAMPLE_RATE } from './constants';

type CompatibleAudio = {
  blob: Blob;
  mimeType: string;
};

const WEBM_MIME = 'audio/webm';

const isBrowserEnv = () => typeof window !== 'undefined';

const getAudioContextCtor = (): typeof AudioContext | null => {
  if (!isBrowserEnv()) return null;
  const context =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return context || null;
};

const getOfflineAudioContextCtor = (): typeof OfflineAudioContext | null => {
  if (!isBrowserEnv()) return null;
  return (
    window.OfflineAudioContext ||
    (window as typeof window & { webkitOfflineAudioContext?: typeof OfflineAudioContext })
      .webkitOfflineAudioContext ||
    null
  );
};

/**
 * Resample an AudioBuffer to the desired sample rate using OfflineAudioContext
 */
const resampleAudioBuffer = async (
  buffer: AudioBuffer,
  targetSampleRate: number
): Promise<AudioBuffer> => {
  if (Math.abs(buffer.sampleRate - targetSampleRate) < 1) {
    return buffer;
  }

  const OfflineCtor = getOfflineAudioContextCtor();
  if (!OfflineCtor) {
    return buffer;
  }

  const length = Math.max(1, Math.ceil(buffer.duration * targetSampleRate));
  const offlineContext = new OfflineCtor(buffer.numberOfChannels, length, targetSampleRate);
  const source = offlineContext.createBufferSource();
  source.buffer = buffer;
  source.connect(offlineContext.destination);
  source.start(0);

  return offlineContext.startRendering();
};

/**
 * Convert an AudioBuffer to a 16-bit PCM WAV ArrayBuffer
 */
const audioBufferToWav = (buffer: AudioBuffer): ArrayBuffer => {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = 2; // 16-bit PCM
  const blockAlign = numChannels * bytesPerSample;
  const dataLength = buffer.length * blockAlign;
  const bufferLength = 44 + dataLength;
  const wavBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(wavBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF header
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');

  // fmt chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // Audio format: PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // Bits per sample

  // data chunk
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  // Interleave channels
  let offset = 44;
  const channelData: Float32Array[] = [];
  for (let i = 0; i < numChannels; i++) {
    channelData.push(buffer.getChannelData(i));
  }

  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      let sample = channelData[ch][i];
      sample = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return wavBuffer;
};

/**
 * Ensure audio is in a format accepted by the STT model.
 * Converts webm blobs to WAV (16-bit PCM) on the client before upload.
 */
export async function ensureSttCompatibleAudio(audioBlob: Blob): Promise<CompatibleAudio> {
  const mimeType = (audioBlob.type || WEBM_MIME).split(';')[0];
  if (mimeType !== WEBM_MIME) {
    return { blob: audioBlob, mimeType };
  }

  const AudioContextCtor = getAudioContextCtor();
  if (!AudioContextCtor) {
    console.warn('STT: AudioContext unavailable, sending original webm blob');
    return { blob: audioBlob, mimeType };
  }

  try {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioContext = new AudioContextCtor();
    const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    // Close context to avoid leaks
    await audioContext.close().catch(() => {});

    const resampled = await resampleAudioBuffer(decoded, AUDIO_SAMPLE_RATE);
    const wavArrayBuffer = audioBufferToWav(resampled);
    const wavBlob = new Blob([wavArrayBuffer], { type: 'audio/wav' });

    return { blob: wavBlob, mimeType: 'audio/wav' };
  } catch (err) {
    console.error('STT: Failed to convert webm to wav, falling back to original blob', err);
    return { blob: audioBlob, mimeType };
  }
}
