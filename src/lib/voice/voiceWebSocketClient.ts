import type { XAIVoice } from '@/lib/voice/types';
import type { VoiceTransportEvent } from '@/lib/voice/events';
import { logger } from '@/lib/logger';

export class VoiceWebSocketClient {
  private ws: WebSocket | null = null;
  private sessionReady = false;
  private currentAssistantMessage = '';
  private readonly wsUrl: string;
  private readonly sampleRate: number;
  private readonly voice: XAIVoice;
  private readonly instructions: string;
  private readonly token: string;
  private readonly debug: boolean;
  private readonly onEvent: (event: VoiceTransportEvent) => void;

  constructor(opts: {
    wsUrl: string;
    sampleRate: number;
    voice: XAIVoice;
    instructions: string;
    token: string;
    onEvent: (event: VoiceTransportEvent) => void;
    debug?: boolean;
  }) {
    this.wsUrl = opts.wsUrl;
    this.sampleRate = opts.sampleRate;
    this.voice = opts.voice;
    this.instructions = opts.instructions;
    this.token = opts.token;
    this.onEvent = opts.onEvent;
    this.debug = opts.debug ?? false;
  }

  connect() {
    const ws = new WebSocket(this.wsUrl, [
      'realtime',
      `openai-insecure-api-key.${this.token}`,
      'openai-beta.realtime-v1',
    ]);

    ws.onopen = () => {
      this.log('WebSocket connected');
    };
    ws.onmessage = (event) => this.handleWebSocketMessage(event);
    ws.onerror = (event) => {
      this.error('WebSocket error event', event);
      this.emit({
        type: 'error',
        message: 'WebSocket connection failed. Check console for details.',
      });
    };
    ws.onclose = (event) => {
      this.log('WebSocket closed', {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      });
      this.sessionReady = false;
      this.emit({ type: 'status', status: { connected: false } });
    };

    this.ws = ws;
  }

  close() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch (error) {
        this.error('Error closing WebSocket', error);
      }
      this.ws = null;
    }
    this.sessionReady = false;
    this.currentAssistantMessage = '';
  }

  sendAudioChunk(chunk: Float32Array) {
    if (!this.sessionReady || this.ws?.readyState !== WebSocket.OPEN) return;
    const base64Audio = this.float32ToBase64PCM16(chunk);
    this.ws.send(
      JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: base64Audio,
      }),
    );
  }

  private handleWebSocketMessage(event: MessageEvent) {
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
                instructions: this.instructions,
                voice: this.voice,
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
          this.emit({ type: 'status', status: { connected: true, listening: true } });
          break;
        case 'input_audio_buffer.speech_started':
          this.emit({ type: 'speech_started' });
          this.emit({ type: 'status', status: { speaking: false, listening: true } });
          break;
        case 'conversation.item.input_audio_transcription.completed':
          if (message.transcript) {
            this.emit({ type: 'user_message', content: message.transcript });
          }
          this.emit({ type: 'status', status: { listening: false } });
          break;
        case 'response.output_audio.delta':
          if (message.delta) {
            const audioData = this.base64ToFloat32PCM16(message.delta);
            this.emit({ type: 'audio_delta', audio: audioData });
          }
          break;
        case 'response.output_audio_transcript.delta':
          if (message.delta) {
            this.currentAssistantMessage += message.delta;
          }
          break;
        case 'response.done':
          if (this.currentAssistantMessage) {
            this.emit({ type: 'assistant_message', content: this.currentAssistantMessage });
            this.currentAssistantMessage = '';
          }
          this.emit({ type: 'status', status: { listening: true } });
          break;
        case 'error':
          this.error('xAI WebSocket error', message.error);
          this.emit({ type: 'error', message: message.error?.message || 'Unknown error' });
          break;
      }
    } catch (error) {
      this.error('Error parsing WebSocket message', error);
    }
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

  private emit(event: VoiceTransportEvent) {
    this.onEvent(event);
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
