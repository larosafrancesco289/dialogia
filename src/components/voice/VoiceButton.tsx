'use client';

import { useState, useCallback } from 'react';
import { MicrophoneIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useVoice } from '@/components/voice/VoiceProvider';

type VoiceButtonProps = {
  className?: string;
};

export function VoiceButton({ className = '' }: VoiceButtonProps) {
  const { voiceMode, start, stop } = useVoice();
  const [isStarting, setIsStarting] = useState(false);
  const isActive = voiceMode !== 'idle';

  const handleToggle = useCallback(async () => {
    if (isActive) {
      stop();
      return;
    }
    setIsStarting(true);
    try {
      await start();
    } catch (error) {
      console.error('Voice start failed', error);
    } finally {
      setIsStarting(false);
    }
  }, [isActive, start, stop]);

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isStarting}
      aria-pressed={isActive}
      aria-label={isActive ? 'End voice conversation' : 'Start voice conversation'}
      className={`btn flex items-center gap-2 ${isActive ? 'btn-primary' : 'btn-outline'} ${className}`}
    >
      {isActive ? <XMarkIcon className="h-4 w-4" /> : <MicrophoneIcon className="h-4 w-4" />}
      <span>{isStarting ? 'Starting...' : isActive ? 'End Voice' : 'Voice'}</span>
    </button>
  );
}

export default VoiceButton;
