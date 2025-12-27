'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useChatStore } from '@/lib/store';
import { getVoiceSessionManager, type VoiceSessionStatus } from '@/lib/voice/xaiSession';

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

  const handleStatusChange = useCallback(
    (status: VoiceSessionStatus) => {
      if (typeof status.active === 'boolean') setVoiceActive(status.active);
      if (typeof status.connected === 'boolean') setVoiceConnected(status.connected);
      if (typeof status.listening === 'boolean') setVoiceListening(status.listening);
      if (typeof status.speaking === 'boolean') setVoiceSpeaking(status.speaking);
    },
    [setVoiceActive, setVoiceConnected, setVoiceListening, setVoiceSpeaking],
  );

  const handleError = useCallback(
    (message: string | null) => {
      setVoiceError(message);
    },
    [setVoiceError],
  );

  const handleUserMessage = useCallback(
    (content: string) => {
      const userMessage: VoiceMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);
      onUserMessage?.(content);
    },
    [onUserMessage],
  );

  const handleAssistantMessage = useCallback(
    (content: string) => {
      const assistantMessage: VoiceMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      onAssistantMessage?.(content);
    },
    [onAssistantMessage],
  );

  const start = useCallback(async () => {
    await manager.start({
      voice: voiceConfig.voice,
      instructions: voiceConfig.instructions,
      handlers: {
        onUserMessage: handleUserMessage,
        onAssistantMessage: handleAssistantMessage,
        onStatusChange: handleStatusChange,
        onError: handleError,
      },
    });
  }, [
    manager,
    voiceConfig,
    handleUserMessage,
    handleAssistantMessage,
    handleStatusChange,
    handleError,
  ]);

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
