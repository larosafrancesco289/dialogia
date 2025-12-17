'use client';

import { MicrophoneIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useChatStore } from '@/lib/store';
import { useXAIVoice } from '@/lib/hooks/useXAIVoice';

interface VoiceButtonProps {
  className?: string;
}

export function VoiceButton({ className }: VoiceButtonProps) {
  const isActive = useChatStore((s) => s.voice.isActive);
  const isConnected = useChatStore((s) => s.voice.isConnected);
  const isListening = useChatStore((s) => s.voice.isListening);
  const isSpeaking = useChatStore((s) => s.voice.isSpeaking);
  const error = useChatStore((s) => s.voice.error);
  const addVoiceUserMessage = useChatStore((s) => s.addVoiceUserMessage);
  const addVoiceAssistantMessage = useChatStore((s) => s.addVoiceAssistantMessage);
  const ensureChatForVoice = useChatStore((s) => s.ensureChatForVoice);

  const { start, stop } = useXAIVoice({
    onUserMessage: (content) => {
      addVoiceUserMessage(content);
    },
    onAssistantMessage: (content) => {
      addVoiceAssistantMessage(content);
    },
  });

  const handleClick = async () => {
    console.log('[VoiceButton] Click, isActive:', isActive);
    if (isActive) {
      stop();
    } else {
      // Ensure chat exists before starting
      await ensureChatForVoice();
      await start();
    }
  };

  const getStatusText = () => {
    if (error) return 'Error';
    if (isSpeaking) return 'Speaking...';
    if (isListening) return 'Listening...';
    if (isConnected) return 'Connected';
    if (isActive) return 'Connecting...';
    return 'Voice';
  };

  const getStatusColor = () => {
    if (error) return 'text-red-500';
    if (isSpeaking) return 'text-purple-500';
    if (isListening) return 'text-green-500';
    if (isConnected) return 'text-blue-500';
    return '';
  };

  return (
    <button
      className={`btn ${isActive ? 'btn-primary' : 'btn-outline'} ${className || ''}`}
      onClick={handleClick}
      aria-label={isActive ? 'Stop voice mode' : 'Start voice mode'}
      title={getStatusText()}
    >
      {isActive ? (
        <span className="flex items-center gap-1.5">
          <XMarkIcon className="h-4 w-4" />
          <span className={`text-xs hidden sm:inline ${getStatusColor()}`}>{getStatusText()}</span>
        </span>
      ) : (
        <MicrophoneIcon className="h-4 w-4" />
      )}
    </button>
  );
}
