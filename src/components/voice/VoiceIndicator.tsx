'use client';

// Module: components/voice/VoiceIndicator
// Responsibility: Inline voice status indicator with waveform visualization

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from '@/lib/store';
import type { VoiceMode } from '@/lib/voice/types';

interface VoiceIndicatorProps {
  /** Additional CSS classes */
  className?: string;
  /** Whether to show full indicator or compact version */
  variant?: 'full' | 'compact';
}

/**
 * Voice status indicator with animated waveform
 */
export function VoiceIndicator({ className = '', variant = 'full' }: VoiceIndicatorProps) {
  const { voiceMode, audioLevel, partialTranscript, llmStreamingText, recordingDurationMs } =
    useChatStore((s) => s.voice);

  const isActive = voiceMode !== 'idle';

  // Format recording duration
  const formattedDuration = useMemo(() => {
    const seconds = Math.floor(recordingDurationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }, [recordingDurationMs]);

  // Get status text
  const statusText = useMemo(() => {
    switch (voiceMode) {
      case 'listening':
        return 'Listening...';
      case 'processing':
        return 'Thinking...';
      case 'speaking':
        return 'Speaking...';
      case 'interrupted':
        return 'Interrupted';
      default:
        return '';
    }
  }, [voiceMode]);

  // Get status color
  const statusColor = useMemo(() => {
    switch (voiceMode) {
      case 'listening':
        return 'text-red-500';
      case 'processing':
        return 'text-purple-500';
      case 'speaking':
        return 'text-green-500';
      case 'interrupted':
        return 'text-yellow-500';
      default:
        return 'text-muted';
    }
  }, [voiceMode]);

  if (!isActive) return null;

  if (variant === 'compact') {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className={`flex items-center gap-2 ${className}`}
        >
          <WaveformBars level={audioLevel} mode={voiceMode} size="small" />
          <span className={`text-xs font-medium ${statusColor}`}>{statusText}</span>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ duration: 0.2 }}
        className={`flex flex-col gap-2 p-3 rounded-lg bg-surface border border-border ${className}`}
      >
        {/* Header with status and duration */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <WaveformBars level={audioLevel} mode={voiceMode} />
            <span className={`text-sm font-medium ${statusColor}`}>{statusText}</span>
          </div>
          {voiceMode === 'listening' && (
            <span className="text-xs text-muted font-mono">{formattedDuration}</span>
          )}
        </div>

        {/* Transcript/Response display */}
        <div className="min-h-[2rem]">
          {voiceMode === 'listening' && partialTranscript && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm text-muted italic"
            >
              {partialTranscript}
            </motion.p>
          )}
          {(voiceMode === 'processing' || voiceMode === 'speaking') && llmStreamingText && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm text-fg"
            >
              {llmStreamingText}
            </motion.p>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Animated waveform bars component
 */
interface WaveformBarsProps {
  level: number;
  mode: VoiceMode;
  size?: 'small' | 'medium';
}

function WaveformBars({ level, mode, size = 'medium' }: WaveformBarsProps) {
  const barCount = 5;
  const isAnimating = mode === 'listening' || mode === 'speaking';

  // Get bar color based on mode
  const barColor = useMemo(() => {
    switch (mode) {
      case 'listening':
        return 'bg-red-500';
      case 'processing':
        return 'bg-purple-500';
      case 'speaking':
        return 'bg-green-500';
      default:
        return 'bg-muted';
    }
  }, [mode]);

  const containerHeight = size === 'small' ? 'h-4' : 'h-6';
  const barWidth = size === 'small' ? 'w-0.5' : 'w-1';
  const gap = size === 'small' ? 'gap-0.5' : 'gap-1';

  return (
    <div className={`flex items-center ${gap} ${containerHeight}`}>
      {Array.from({ length: barCount }).map((_, i) => {
        // Create varied heights based on index and audio level
        const baseHeight = 0.3 + (i === Math.floor(barCount / 2) ? 0.3 : 0.1 * (i % 2));
        const animatedHeight = isAnimating ? baseHeight + level * 0.5 : baseHeight;

        return (
          <motion.div
            key={i}
            className={`${barWidth} rounded-full ${barColor}`}
            animate={{
              scaleY: animatedHeight,
            }}
            transition={{
              type: 'spring',
              stiffness: 300,
              damping: 20,
              delay: i * 0.05,
            }}
            style={{
              height: '100%',
              transformOrigin: 'center',
            }}
          />
        );
      })}
    </div>
  );
}

export default VoiceIndicator;
