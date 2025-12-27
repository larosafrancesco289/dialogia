'use client';

import type { XAIVoice } from '@/lib/voice/types';
import { logger } from '@/lib/logger';

const DEFAULT_SAMPLE_RATE = 24000;
const DEFAULT_WS_URL = 'wss://api.x.ai/v1/realtime';

export type VoiceSessionStatus = {
  active?: boolean;
  connected?: boolean;
  listening?: boolean;
  speaking?: boolean;
};

export type VoiceSessionHandlers = {
  onUserMessage?: (content: string) => void;
  onAssistantMessage?: (content: string) => void;
  onStatusChange?: (status: VoiceSessionStatus) => void;
  onError?: (message: string | null) => void;
};

type StartOptions = {
  voice: XAIVoice;
  instructions: string;
  handlers?: VoiceSessionHandlers;
};

export class VoiceSessionManager {
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sessionReady = false;
  private currentAssistantMessage = '';
  private audioQueue: Float32Array[] = [];
  private isPlaying = false;
  private handlers?: VoiceSessionHandlers;

  private readonly sampleRate: number;
  private readonly wsUrl: string;
  private readonly debug: boolean;

  constructor(opts?: { sampleRate?: number; wsUrl?: string; debug?: boolean }) {
    this.sampleRate = opts?.sampleRate ?? DEFAULT_SAMPLE_RATE;
    this.wsUrl = opts?.wsUrl ?? DEFAULT_WS_URL;
    this.debug = opts?.debug ?? false;
  }

  setHandlers(handlers?: VoiceSessionHandlers) {
    this.handlers = handlers;
  }

  stop() {
    this.log('Stop called');
    this.cleanup();
    this.emitStatus({
      active: false,
      connected: false,
      listening: false,
      speaking: false,
    });
  }

  getDebugState() {
    return {
      hasWebSocket: !!this.ws,
      hasAudioContext: !!this.audioContext,
      hasMediaStream: !!this.mediaStream,
      sessionReady: this.sessionReady,
    };
  }

  async start(options: StartOptions) {
    const { voice, instructions, handlers } = options;
    this.setHandlers(handlers);

    try {
      this.cleanup();
      this.emitError(null);
      this.emitStatus({ active: true, connected: false, listening: false, speaking: false });

      this.log('Requesting ephemeral token');
      const session = await this.getEphemeralToken(voice, instructions);
      const token = session.client_secret?.value;
      if (!token) throw new Error('Missing session token');

      this.audioContext = new AudioContext({ sampleRate: this.sampleRate });
      this.log('AudioContext created', { state: this.audioContext.state });

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this.sampleRate,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      const ws = new WebSocket(this.wsUrl, [
        'realtime',
        `openai-insecure-api-key.${token}`,
        'openai-beta.realtime-v1',
      ]);
      ws.onopen = () => {
        this.log('WebSocket connected');
      };
      ws.onmessage = (event) => this.handleWebSocketMessage(event, instructions, voice);
      ws.onerror = (event) => {
        this.error('WebSocket error event', event);
        this.emitError('WebSocket connection failed. Check console for details.');
      };
      ws.onclose = (event) => {
        this.log('WebSocket closed', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        });
        this.emitStatus({ connected: false });
        this.sessionReady = false;
      };

      this.ws = ws;

      await this.audioContext.audioWorklet.addModule(
        URL.createObjectURL(
          new Blob(
            [
              `
              class AudioProcessor extends AudioWorkletProcessor {
                constructor() {
                  super();
                  this.buffer = new Float32Array(0);
                }

                process(inputs) {
                  const input = inputs[0];
                  if (input && input[0]) {
                    const newBuffer = new Float32Array(this.buffer.length + input[0].length);
                    newBuffer.set(this.buffer);
                    newBuffer.set(input[0], this.buffer.length);
                    this.buffer = newBuffer;

                    while (this.buffer.length >= 2400) {
                      const chunk = this.buffer.slice(0, 2400);
                      this.buffer = this.buffer.slice(2400);
                      this.port.postMessage(chunk);
                    }
                  }
                  return true;
                }
              }
              registerProcessor('audio-processor', AudioProcessor);
            `,
            ],
            { type: 'application/javascript' },
          ),
        ),
      );

      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-processor');
      this.workletNode.port.onmessage = (event) => {
        if (this.sessionReady && this.ws?.readyState === WebSocket.OPEN) {
          const base64Audio = this.float32ToBase64PCM16(event.data);
          this.ws.send(
            JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: base64Audio,
            }),
          );
        }
      };
      source.connect(this.workletNode);
      this.log('Audio pipeline connected');
    } catch (error) {
      this.error('Failed to start voice mode', error);
      this.cleanup();
      this.emitError(error instanceof Error ? error.message : 'Failed to start voice mode');
      this.emitStatus({ active: false });
    }
  }

  private async getEphemeralToken(voice: XAIVoice, instructions: string) {
    const response = await fetch('/api/xai/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voice, instructions }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get session token');
    }

    return response.json();
  }

  private handleWebSocketMessage(event: MessageEvent, instructions: string, voice: XAIVoice) {
    try {
      const message = JSON.parse(event.data);
      if (message.type !== 'response.output_audio.delta') {
        this.log(`Received ${message.type}`, message);
      }

      switch (message.type) {
        case 'conversation.created':
          if (this.ws?.readyState === WebSocket.OPEN) {
            const sessionConfig = {
              type: 'session.update',
              session: {
                instructions,
                voice,
                audio: {
                  input: { format: { type: 'audio/pcm', rate: this.sampleRate } },
                  output: { format: { type: 'audio/pcm', rate: this.sampleRate } },
                },
                turn_detection: { type: 'server_vad' },
              },
            };
            this.ws.send(JSON.stringify(sessionConfig));
          }
          break;
        case 'session.updated':
          this.sessionReady = true;
          this.emitStatus({ connected: true, listening: true });
          break;
        case 'input_audio_buffer.speech_started':
          this.audioQueue = [];
          this.isPlaying = false;
          this.emitStatus({ speaking: false, listening: true });
          break;
        case 'conversation.item.input_audio_transcription.completed':
          if (message.transcript) {
            this.handlers?.onUserMessage?.(message.transcript);
          }
          this.emitStatus({ listening: false });
          break;
        case 'response.output_audio.delta':
          if (message.delta) {
            const audioData = this.base64ToFloat32PCM16(message.delta);
            void this.playAudioChunk(audioData);
          }
          break;
        case 'response.output_audio_transcript.delta':
          if (message.delta) {
            this.currentAssistantMessage += message.delta;
          }
          break;
        case 'response.done':
          if (this.currentAssistantMessage) {
            this.handlers?.onAssistantMessage?.(this.currentAssistantMessage);
            this.currentAssistantMessage = '';
          }
          this.emitStatus({ listening: true });
          break;
        case 'error':
          this.error('xAI WebSocket error', message.error);
          this.emitError(message.error?.message || 'Unknown error');
          break;
      }
    } catch (error) {
      this.error('Error parsing WebSocket message', error);
    }
  }

  private async playAudioChunk(audioData: Float32Array) {
    if (!this.audioContext) return;

    this.audioQueue.push(audioData);
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.emitStatus({ speaking: true });

    const playNext = async () => {
      const chunk = this.audioQueue.shift();
      if (!chunk || !this.audioContext) {
        this.isPlaying = false;
        this.emitStatus({ speaking: false });
        return;
      }

      const audioBuffer = this.audioContext.createBuffer(1, chunk.length, this.sampleRate);
      audioBuffer.copyToChannel(new Float32Array(chunk), 0);

      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      source.onended = playNext;
      source.start();
    };

    await playNext();
  }

  private float32ToBase64PCM16(float32Array: Float32Array): string {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    const uint8Array = new Uint8Array(int16Array.buffer);
    let binary = '';
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    return btoa(binary);
  }

  private base64ToFloat32PCM16(base64: string): Float32Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const int16Array = new Int16Array(bytes.buffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7fff);
    }
    return float32Array;
  }

  private cleanup() {
    this.log('Cleaning up voice resources');

    if (this.ws) {
      this.log('Closing WebSocket', { state: this.ws.readyState });
      try {
        this.ws.close();
      } catch (error) {
        this.error('Error closing WebSocket', error);
      }
      this.ws = null;
    }

    if (this.mediaStream) {
      try {
        this.mediaStream.getTracks().forEach((track) => track.stop());
      } catch (error) {
        this.error('Error stopping media stream', error);
      }
      this.mediaStream = null;
    }

    if (this.workletNode) {
      try {
        this.workletNode.disconnect();
      } catch (error) {
        this.error('Error disconnecting worklet node', error);
      }
      this.workletNode = null;
    }

    if (this.audioContext) {
      try {
        void this.audioContext.close();
      } catch (error) {
        this.error('Error closing audio context', error);
      }
      this.audioContext = null;
    }

    this.sessionReady = false;
    this.currentAssistantMessage = '';
    this.audioQueue = [];
    this.isPlaying = false;
  }

  private emitStatus(status: VoiceSessionStatus) {
    this.handlers?.onStatusChange?.(status);
  }

  private emitError(message: string | null) {
    this.handlers?.onError?.(message);
  }

  private log(message: string, payload?: unknown) {
    if (!this.debug) return;
    if (payload !== undefined) {
      logger.debug('[xAI Voice]', message, payload);
    } else {
      logger.debug('[xAI Voice]', message);
    }
  }

  private error(message: string, payload?: unknown) {
    if (!this.debug) return;
    if (payload !== undefined) {
      logger.error('[xAI Voice]', message, payload);
    } else {
      logger.error('[xAI Voice]', message);
    }
  }
}

let sharedManager: VoiceSessionManager | null = null;

export function getVoiceSessionManager() {
  if (!sharedManager) {
    const debug = process.env.NODE_ENV !== 'production';
    sharedManager = new VoiceSessionManager({ debug });
    if (debug && typeof window !== 'undefined') {
      const debugWindow = window as Window & {
        __xaiVoiceCleanup?: () => void;
        __xaiVoiceState?: () => unknown;
      };
      debugWindow.__xaiVoiceCleanup = () => sharedManager?.stop();
      debugWindow.__xaiVoiceState = () => sharedManager?.getDebugState();
    }
  }
  return sharedManager;
}
