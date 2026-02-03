'use client';

import type { XAIVoice } from '@/lib/voice/types';
import { logger } from '@/lib/logger';
import { isProd } from '@/lib/env/runtime';
import { VoiceAudioCapture } from '@/lib/voice/voiceAudioCapture';
import { VoiceAudioPlayback } from '@/lib/voice/voiceAudioPlayback';
import { VoiceWebSocketClient } from '@/lib/voice/voiceWebSocketClient';
import type {
  VoiceSessionEvent,
  VoiceSessionEventHandler,
  VoiceSessionStatus,
  VoiceTransportEvent,
} from '@/lib/voice/events';

export type {
  VoiceSessionEvent,
  VoiceSessionEventHandler,
  VoiceSessionStatus,
} from '@/lib/voice/events';

const DEFAULT_SAMPLE_RATE = 24000;
const DEFAULT_WS_URL = 'wss://api.x.ai/v1/realtime';

type StartOptions = {
  voice: XAIVoice;
  instructions: string;
  onEvent?: VoiceSessionEventHandler;
};

export class VoiceSessionManager {
  private wsClient: VoiceWebSocketClient | null = null;
  private audioContext: AudioContext | null = null;
  private audioCapture: VoiceAudioCapture | null = null;
  private audioPlayback: VoiceAudioPlayback | null = null;
  private handler?: VoiceSessionEventHandler;

  private readonly sampleRate: number;
  private readonly wsUrl: string;
  private readonly debug: boolean;

  constructor(opts?: { sampleRate?: number; wsUrl?: string; debug?: boolean }) {
    this.sampleRate = opts?.sampleRate ?? DEFAULT_SAMPLE_RATE;
    this.wsUrl = opts?.wsUrl ?? DEFAULT_WS_URL;
    this.debug = opts?.debug ?? false;
  }

  setHandler(handler?: VoiceSessionEventHandler) {
    this.handler = handler;
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
      hasWebSocket: !!this.wsClient,
      hasAudioContext: !!this.audioContext,
      hasMediaStream: !!this.audioCapture?.getStream(),
    };
  }

  async start(options: StartOptions) {
    const { voice, instructions, onEvent } = options;
    this.setHandler(onEvent);

    try {
      this.cleanup();
      this.emit({ type: 'error', message: null });
      this.emitStatus({ active: true, connected: false, listening: false, speaking: false });

      this.log('Requesting ephemeral token');
      const session = await this.getEphemeralToken(voice, instructions);
      const token = session.client_secret?.value;
      if (!token) throw new Error('Missing session token');

      this.audioContext = new AudioContext({ sampleRate: this.sampleRate });
      this.log('AudioContext created', { state: this.audioContext.state });

      this.audioPlayback = new VoiceAudioPlayback({
        audioContext: this.audioContext,
        sampleRate: this.sampleRate,
        onStatus: (status) => this.emitStatus(status),
      });

      this.wsClient = new VoiceWebSocketClient({
        wsUrl: this.wsUrl,
        sampleRate: this.sampleRate,
        voice,
        instructions,
        token,
        debug: this.debug,
        onEvent: (event) => this.handleTransportEvent(event),
      });
      this.wsClient.connect();

      this.audioCapture = new VoiceAudioCapture({
        audioContext: this.audioContext,
        sampleRate: this.sampleRate,
        onChunk: (chunk) => this.wsClient?.sendAudioChunk(chunk),
      });
      await this.audioCapture.start();
      this.log('Audio pipeline connected');
    } catch (error) {
      this.error('Failed to start voice mode', error);
      this.cleanup();
      this.emit({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to start voice mode',
      });
      this.emitStatus({ active: false });
    }
  }

  private handleTransportEvent(event: VoiceTransportEvent) {
    switch (event.type) {
      case 'audio_delta':
        this.audioPlayback?.enqueue(event.audio);
        return;
      case 'speech_started':
        this.audioPlayback?.reset();
        return;
      case 'status':
      case 'user_message':
      case 'assistant_message':
      case 'error':
        this.emit(event);
        return;
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

  private cleanup() {
    this.log('Cleaning up voice resources');

    if (this.wsClient) {
      this.wsClient.close();
      this.wsClient = null;
    }

    if (this.audioCapture) {
      this.audioCapture.stop();
      this.audioCapture = null;
    }

    if (this.audioPlayback) {
      this.audioPlayback.stop();
      this.audioPlayback = null;
    }

    if (this.audioContext) {
      try {
        void this.audioContext.close();
      } catch (error) {
        this.error('Error closing audio context', error);
      }
      this.audioContext = null;
    }
  }

  private emit(event: VoiceSessionEvent) {
    this.handler?.(event);
  }

  private emitStatus(status: VoiceSessionStatus) {
    this.emit({ type: 'status', status });
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
    const debug = !isProd();
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
