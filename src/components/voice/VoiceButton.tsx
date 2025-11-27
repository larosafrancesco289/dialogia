'use client';

// Module: components/voice/VoiceButton
// Responsibility: Voice activation button with state-based appearance

import { useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MicrophoneIcon,
  StopIcon,
  SpeakerWaveIcon,
} from '@heroicons/react/24/outline';
import { useVoicePipeline } from '@/lib/hooks/useVoicePipeline';
import type { VoiceMode } from '@/lib/voice/types';

interface VoiceButtonProps {
  /** Additional CSS classes */
  className?: string;
  /** Whether the button is disabled */
  disabled?: boolean;
}

/**
 * Voice activation button that transforms based on pipeline state
 */
export function VoiceButton({ className = '', disabled = false }: VoiceButtonProps) {
  const {
    voiceMode,
    isEnabled,
    isRecording,
    isPlaying,
    audioLevel,
    error,
    start,
    stop,
    startRecording,
    stopRecording,
    interrupt,
  } = useVoicePipeline();

  const isHoldingRef = useRef(false);
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Handle keyboard shortcut (Escape to interrupt)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (isPlaying || voiceMode === 'speaking')) {
        interrupt();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, voiceMode, interrupt]);

  // Handle mouse/touch down (start hold for push-to-talk)
  const handlePointerDown = useCallback(() => {
    if (disabled) return;

    isHoldingRef.current = true;

    // Start voice mode if not already enabled
    if (!isEnabled) {
      start().then(() => {
        if (isHoldingRef.current) {
          startRecording();
        }
      });
    } else if (voiceMode === 'idle' || voiceMode === 'interrupted') {
      startRecording();
    }
  }, [disabled, isEnabled, voiceMode, start, startRecording]);

  // Handle mouse/touch up (end hold for push-to-talk)
  const handlePointerUp = useCallback(() => {
    isHoldingRef.current = false;

    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }

    if (isRecording) {
      stopRecording();
    }
  }, [isRecording, stopRecording]);

  // Handle click (for stopping/interrupting)
  const handleClick = useCallback(() => {
    if (disabled) return;

    if (isPlaying || voiceMode === 'speaking') {
      interrupt();
    } else if (isEnabled && !isRecording) {
      stop();
    }
  }, [disabled, isPlaying, voiceMode, isEnabled, isRecording, interrupt, stop]);

  // Get button appearance based on mode
  const getButtonStyle = () => {
    switch (voiceMode) {
      case 'listening':
        return 'bg-red-500 hover:bg-red-600 text-white';
      case 'processing':
        return 'bg-purple-500 text-white';
      case 'speaking':
        return 'bg-green-500 hover:bg-green-600 text-white';
      case 'interrupted':
        return 'bg-yellow-500 text-white';
      default:
        return 'bg-surface hover:bg-surface-hover text-fg';
    }
  };

  // Get icon based on mode
  const getIcon = () => {
    switch (voiceMode) {
      case 'speaking':
        return <SpeakerWaveIcon className="h-5 w-5" />;
      case 'listening':
      case 'processing':
        return <StopIcon className="h-5 w-5" />;
      default:
        return <MicrophoneIcon className="h-5 w-5" />;
    }
  };

  // Calculate scale based on audio level
  const scale = 1 + audioLevel * 0.15;

  return (
    <div className={`relative ${className}`}>
      <motion.button
        type="button"
        className={`
          relative flex items-center justify-center
          w-10 h-10 rounded-full
          transition-colors duration-200
          focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2
          disabled:opacity-50 disabled:cursor-not-allowed
          ${getButtonStyle()}
        `}
        disabled={disabled || voiceMode === 'processing'}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onClick={handleClick}
        animate={{
          scale: isRecording || isPlaying ? scale : 1,
        }}
        transition={{
          type: 'spring',
          stiffness: 400,
          damping: 25,
        }}
        title={getTitle(voiceMode, isRecording)}
        aria-label={getTitle(voiceMode, isRecording)}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={voiceMode}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
          >
            {getIcon()}
          </motion.div>
        </AnimatePresence>

        {/* Pulsing ring for recording state */}
        {isRecording && (
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-red-400"
            initial={{ opacity: 0, scale: 1 }}
            animate={{
              opacity: [0.8, 0],
              scale: [1, 1.5],
            }}
            transition={{
              duration: 1,
              repeat: Infinity,
              ease: 'easeOut',
            }}
          />
        )}

        {/* Processing spinner */}
        {voiceMode === 'processing' && (
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-purple-300 border-t-transparent"
            animate={{ rotate: 360 }}
            transition={{
              duration: 1,
              repeat: Infinity,
              ease: 'linear',
            }}
          />
        )}
      </motion.button>

      {/* Error indicator */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 text-xs text-red-500 bg-red-50 rounded whitespace-nowrap"
        >
          {error}
        </motion.div>
      )}
    </div>
  );
}

/**
 * Get tooltip text based on mode
 */
function getTitle(mode: VoiceMode, isRecording: boolean): string {
  if (isRecording) return 'Release to send';
  switch (mode) {
    case 'listening':
      return 'Listening...';
    case 'processing':
      return 'Processing...';
    case 'speaking':
      return 'Click to interrupt';
    case 'interrupted':
      return 'Interrupted';
    default:
      return 'Hold to speak';
  }
}

export default VoiceButton;
