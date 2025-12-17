'use client';

import { useCallback, useEffect, useState } from 'react';
import { useChatStore } from '@/lib/store';
import type { XAIVoice } from '@/lib/voice/types';

export interface VoiceMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface UseXAIVoiceOptions {
  onUserMessage?: (content: string) => void;
  onAssistantMessage?: (content: string) => void;
}

const SAMPLE_RATE = 24000;
const XAI_WS_URL = 'wss://api.x.ai/v1/realtime';

// ============================================================================
// SINGLETON MODULE-LEVEL STATE
// This ensures there's only ONE set of voice resources regardless of how many
// times the hook is instantiated or the component remounts.
// ============================================================================
let globalWebSocket: WebSocket | null = null;
let globalAudioContext: AudioContext | null = null;
let globalMediaStream: MediaStream | null = null;
let globalWorkletNode: AudioWorkletNode | null = null;
let globalSessionReady = false;
let globalCurrentAssistantMessage = '';
let globalAudioQueue: Float32Array[] = [];
let globalIsPlaying = false;

// Cleanup function that can be called from anywhere
function cleanupGlobalResources() {
  console.log('[xAI Voice] Cleaning up global resources...');

  // Close WebSocket
  if (globalWebSocket) {
    console.log('[xAI Voice] Closing WebSocket, state:', globalWebSocket.readyState);
    try {
      globalWebSocket.close();
    } catch (e) {
      console.error('[xAI Voice] Error closing WebSocket:', e);
    }
    globalWebSocket = null;
  }

  // Stop media stream tracks
  if (globalMediaStream) {
    console.log('[xAI Voice] Stopping media stream tracks');
    try {
      globalMediaStream.getTracks().forEach((track) => {
        console.log('[xAI Voice] Stopping track:', track.kind, track.label);
        track.stop();
      });
    } catch (e) {
      console.error('[xAI Voice] Error stopping media stream:', e);
    }
    globalMediaStream = null;
  }

  // Disconnect worklet
  if (globalWorkletNode) {
    console.log('[xAI Voice] Disconnecting worklet node');
    try {
      globalWorkletNode.disconnect();
    } catch (e) {
      console.error('[xAI Voice] Error disconnecting worklet:', e);
    }
    globalWorkletNode = null;
  }

  // Close audio context
  if (globalAudioContext) {
    console.log('[xAI Voice] Closing audio context, state:', globalAudioContext.state);
    try {
      globalAudioContext.close();
    } catch (e) {
      console.error('[xAI Voice] Error closing audio context:', e);
    }
    globalAudioContext = null;
  }

  // Reset other state
  globalSessionReady = false;
  globalCurrentAssistantMessage = '';
  globalAudioQueue = [];
  globalIsPlaying = false;

  console.log('[xAI Voice] Global resources cleaned up');
}

// Expose for debugging in browser console
if (typeof window !== 'undefined') {
  (window as any).__xaiVoiceCleanup = cleanupGlobalResources;
  (window as any).__xaiVoiceState = () => ({
    hasWebSocket: !!globalWebSocket,
    webSocketState: globalWebSocket?.readyState,
    hasAudioContext: !!globalAudioContext,
    audioContextState: globalAudioContext?.state,
    hasMediaStream: !!globalMediaStream,
    mediaStreamActive: globalMediaStream?.active,
    sessionReady: globalSessionReady,
  });
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================
export function useXAIVoice(options: UseXAIVoiceOptions = {}) {
  const { onUserMessage, onAssistantMessage } = options;

  const voiceConfig = useChatStore((s) => s.voice.config);
  const setVoiceActive = useChatStore((s) => s.setVoiceActive);
  const setVoiceConnected = useChatStore((s) => s.setVoiceConnected);
  const setVoiceListening = useChatStore((s) => s.setVoiceListening);
  const setVoiceSpeaking = useChatStore((s) => s.setVoiceSpeaking);
  const setVoiceError = useChatStore((s) => s.setVoiceError);

  const [messages, setMessages] = useState<VoiceMessage[]>([]);

  const getEphemeralToken = async (voice: XAIVoice, instructions: string) => {
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
  };

  const float32ToBase64PCM16 = (float32Array: Float32Array): string => {
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
  };

  const base64ToFloat32PCM16 = (base64: string): Float32Array => {
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
  };

  const playAudioChunk = useCallback(
    async (audioData: Float32Array) => {
      if (!globalAudioContext) return;

      globalAudioQueue.push(audioData);

      if (globalIsPlaying) return;
      globalIsPlaying = true;
      setVoiceSpeaking(true);

      const playNext = async () => {
        const chunk = globalAudioQueue.shift();
        if (!chunk || !globalAudioContext) {
          globalIsPlaying = false;
          setVoiceSpeaking(false);
          return;
        }

        const audioBuffer = globalAudioContext.createBuffer(1, chunk.length, SAMPLE_RATE);
        audioBuffer.copyToChannel(new Float32Array(chunk), 0);

        const source = globalAudioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(globalAudioContext.destination);
        source.onended = playNext;
        source.start();
      };

      playNext();
    },
    [setVoiceSpeaking]
  );

  const stop = useCallback(() => {
    console.log('[xAI Voice] Stop called');

    // Clean up all global resources
    cleanupGlobalResources();

    // Reset store state
    setVoiceActive(false);
    setVoiceConnected(false);
    setVoiceListening(false);
    setVoiceSpeaking(false);
  }, [setVoiceActive, setVoiceConnected, setVoiceListening, setVoiceSpeaking]);

  const start = useCallback(async () => {
    try {
      // First, clean up any existing resources
      cleanupGlobalResources();

      setVoiceError(null);
      setVoiceActive(true);

      // Get ephemeral token
      console.log('[xAI Voice] Requesting ephemeral token...');
      const session = await getEphemeralToken(voiceConfig.voice, voiceConfig.instructions);
      console.log('[xAI Voice] Session received:', {
        hasToken: !!session.client_secret?.value,
        expiresAt: session.client_secret?.expires_at,
        voice: session.voice,
      });
      const token = session.client_secret.value;

      // Create audio context
      globalAudioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
      console.log('[xAI Voice] AudioContext created, state:', globalAudioContext.state);

      // Request microphone access
      globalMediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      console.log('[xAI Voice] MediaStream obtained, tracks:', globalMediaStream.getTracks().length);

      // Create WebSocket message handler
      const handleWebSocketMessage = (event: MessageEvent) => {
        try {
          const message = JSON.parse(event.data);

          // Log non-audio messages for debugging
          if (message.type !== 'response.output_audio.delta') {
            console.log('[xAI Voice] Received:', message.type, message);
          }

          switch (message.type) {
            case 'conversation.created':
              // Send session configuration
              if (globalWebSocket?.readyState === WebSocket.OPEN) {
                const sessionConfig = {
                  type: 'session.update',
                  session: {
                    instructions: voiceConfig.instructions,
                    voice: voiceConfig.voice,
                    audio: {
                      input: { format: { type: 'audio/pcm', rate: SAMPLE_RATE } },
                      output: { format: { type: 'audio/pcm', rate: SAMPLE_RATE } },
                    },
                    turn_detection: { type: 'server_vad' },
                  },
                };
                globalWebSocket.send(JSON.stringify(sessionConfig));
              }
              break;

            case 'session.updated':
              globalSessionReady = true;
              setVoiceConnected(true);
              setVoiceListening(true);
              break;

            case 'input_audio_buffer.speech_started':
              // User started speaking - interrupt any playback
              globalAudioQueue = [];
              globalIsPlaying = false;
              setVoiceSpeaking(false);
              setVoiceListening(true);
              break;

            case 'conversation.item.input_audio_transcription.completed':
              // User speech transcribed
              if (message.transcript) {
                const userMessage: VoiceMessage = {
                  id: crypto.randomUUID(),
                  role: 'user',
                  content: message.transcript,
                  timestamp: new Date(),
                };
                setMessages((prev) => [...prev, userMessage]);
                onUserMessage?.(message.transcript);
              }
              setVoiceListening(false);
              break;

            case 'response.output_audio.delta':
              // Audio chunk from assistant
              if (message.delta) {
                const audioData = base64ToFloat32PCM16(message.delta);
                playAudioChunk(audioData);
              }
              break;

            case 'response.output_audio_transcript.delta':
              // Transcript delta from assistant
              if (message.delta) {
                globalCurrentAssistantMessage += message.delta;
              }
              break;

            case 'response.done':
              // Response complete - add assistant message
              if (globalCurrentAssistantMessage) {
                const assistantMessage: VoiceMessage = {
                  id: crypto.randomUUID(),
                  role: 'assistant',
                  content: globalCurrentAssistantMessage,
                  timestamp: new Date(),
                };
                setMessages((prev) => [...prev, assistantMessage]);
                onAssistantMessage?.(globalCurrentAssistantMessage);
                globalCurrentAssistantMessage = '';
              }
              setVoiceListening(true);
              break;

            case 'error':
              console.error('xAI WebSocket error:', message.error);
              setVoiceError(message.error?.message || 'Unknown error');
              break;
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      // Connect WebSocket
      console.log('[xAI Voice] Connecting to WebSocket...');
      const ws = new WebSocket(XAI_WS_URL, [
        'realtime',
        `openai-insecure-api-key.${token}`,
        'openai-beta.realtime-v1',
      ]);

      ws.onopen = () => {
        console.log('[xAI Voice] WebSocket connected');
      };

      ws.onmessage = handleWebSocketMessage;

      ws.onerror = (event) => {
        console.error('[xAI Voice] WebSocket error event:', event);
        setVoiceError('WebSocket connection failed. Check console for details.');
      };

      ws.onclose = (event) => {
        console.log('[xAI Voice] WebSocket closed:', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        });
        setVoiceConnected(false);
        globalSessionReady = false;
      };

      globalWebSocket = ws;

      // Set up audio processing worklet
      await globalAudioContext.audioWorklet.addModule(
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
                    // Accumulate samples
                    const newBuffer = new Float32Array(this.buffer.length + input[0].length);
                    newBuffer.set(this.buffer);
                    newBuffer.set(input[0], this.buffer.length);
                    this.buffer = newBuffer;

                    // Send chunks of ~100ms (2400 samples at 24kHz)
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
            { type: 'application/javascript' }
          )
        )
      );

      const source = globalAudioContext.createMediaStreamSource(globalMediaStream);
      globalWorkletNode = new AudioWorkletNode(globalAudioContext, 'audio-processor');

      globalWorkletNode.port.onmessage = (event) => {
        if (globalSessionReady && globalWebSocket?.readyState === WebSocket.OPEN) {
          const base64Audio = float32ToBase64PCM16(event.data);
          globalWebSocket.send(
            JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: base64Audio,
            })
          );
        }
      };

      source.connect(globalWorkletNode);
      console.log('[xAI Voice] Audio pipeline connected');
    } catch (error) {
      console.error('Failed to start voice mode:', error);
      cleanupGlobalResources();
      setVoiceError(error instanceof Error ? error.message : 'Failed to start voice mode');
      setVoiceActive(false);
    }
  }, [
    voiceConfig,
    setVoiceActive,
    setVoiceConnected,
    setVoiceListening,
    setVoiceSpeaking,
    setVoiceError,
    playAudioChunk,
    onUserMessage,
    onAssistantMessage,
  ]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      console.log('[xAI Voice] Hook unmounting, cleaning up...');
      cleanupGlobalResources();
      setVoiceActive(false);
      setVoiceConnected(false);
      setVoiceListening(false);
      setVoiceSpeaking(false);
    };
  }, [setVoiceActive, setVoiceConnected, setVoiceListening, setVoiceSpeaking]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    start,
    stop,
    messages,
    clearMessages,
  };
}
