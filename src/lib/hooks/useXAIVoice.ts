'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useChatStore } from '@/lib/store';
import { getVoiceSessionManager, type VoiceSessionEvent } from '@/lib/voice/xaiSession';

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

export function useXAIVoice(options: UseXAIVoiceOptions = {}) {
  const { onUserMessage, onAssistantMessage } = options;
  const voiceConfig = useChatStore((s) => s.voice.config);
  const setVoiceActive = useChatStore((s) => s.setVoiceActive);
  const setVoiceConnected = useChatStore((s) => s.setVoiceConnected);
  const setVoiceListening = useChatStore((s) => s.setVoiceListening);
  const setVoiceSpeaking = useChatStore((s) => s.setVoiceSpeaking);
  const setVoiceError = useChatStore((s) => s.setVoiceError);

  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const manager = useMemo(() => getVoiceSessionManager(), []);

  const handleEvent = useCallback(
    (event: VoiceSessionEvent) => {
      switch (event.type) {
        case 'status':
          if (typeof event.status.active === 'boolean') setVoiceActive(event.status.active);
          if (typeof event.status.connected === 'boolean')
            setVoiceConnected(event.status.connected);
          if (typeof event.status.listening === 'boolean')
            setVoiceListening(event.status.listening);
          if (typeof event.status.speaking === 'boolean') setVoiceSpeaking(event.status.speaking);
          return;
        case 'error':
          setVoiceError(event.message);
          return;
        case 'user_message': {
          const userMessage: VoiceMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: event.content,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, userMessage]);
          onUserMessage?.(event.content);
          return;
        }
        case 'assistant_message': {
          const assistantMessage: VoiceMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: event.content,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
          onAssistantMessage?.(event.content);
          return;
        }
      }
    },
    [
      onAssistantMessage,
      onUserMessage,
      setVoiceActive,
      setVoiceConnected,
      setVoiceError,
      setVoiceListening,
      setVoiceSpeaking,
    ],
  );

  const start = useCallback(async () => {
    await manager.start({
      voice: voiceConfig.voice,
      instructions: voiceConfig.instructions,
      onEvent: handleEvent,
    });
  }, [manager, voiceConfig, handleEvent]);

  const stop = useCallback(() => {
    manager.stop();
  }, [manager]);

  useEffect(() => {
    return () => {
      manager.stop();
    };
  }, [manager]);

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
