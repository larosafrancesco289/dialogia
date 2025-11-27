'use client';

// Module: components/voice/VoiceOverlay
// Responsibility: Full-screen immersive voice conversation interface

import { useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useVoice } from '@/components/voice/VoiceProvider';
import { useChatStore } from '@/lib/store';

// CSS custom property colors from the design system
// listening: accent (gold), processing: accent-2 (purple), speaking: success (green)
const VOICE_COLORS = {
  listening: {
    primary: 'var(--color-accent)',
    bg: 'color-mix(in oklab, var(--color-accent) 20%, transparent)',
    bgAlt: 'color-mix(in oklab, var(--color-accent) 10%, transparent)',
  },
  processing: {
    primary: 'var(--color-accent-2)',
    bg: 'color-mix(in oklab, var(--color-accent-2) 20%, transparent)',
    bgAlt: 'color-mix(in oklab, var(--color-accent-2) 10%, transparent)',
  },
  speaking: {
    primary: 'var(--color-success)',
    bg: 'color-mix(in oklab, var(--color-success) 20%, transparent)',
    bgAlt: 'color-mix(in oklab, var(--color-success) 10%, transparent)',
  },
  interrupted: {
    primary: 'var(--color-accent)',
    bg: 'color-mix(in oklab, var(--color-accent) 15%, transparent)',
    bgAlt: 'color-mix(in oklab, var(--color-accent) 8%, transparent)',
  },
  idle: {
    primary: 'var(--color-fg-muted)',
    bg: 'color-mix(in oklab, var(--color-fg-muted) 20%, transparent)',
    bgAlt: 'color-mix(in oklab, var(--color-fg-muted) 10%, transparent)',
  },
};

/**
 * Full-screen voice conversation overlay
 * Provides immersive UX for natural voice interaction
 */
export function VoiceOverlay() {
  const {
    voiceMode,
    isEnabled,
    isPlaying,
    audioLevel,
    currentDb,
    partialTranscript,
    finalTranscript,
    llmText,
    error,
    stop,
    finishRecording,
    interrupt,
  } = useVoice();

  const inputMode = useChatStore((s) => s.voice.voiceConfig.inputMode);
  const recordingDurationMs = useChatStore((s) => s.voice.recordingDurationMs);

  // Get colors for current mode
  const colors = VOICE_COLORS[voiceMode] || VOICE_COLORS.idle;

  // Format duration
  const formattedDuration = useMemo(() => {
    const seconds = Math.floor(recordingDurationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }, [recordingDurationMs]);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isPlaying || voiceMode === 'speaking') {
          interrupt();
        } else {
          stop();
        }
      }
    };

    if (isEnabled) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isEnabled, isPlaying, voiceMode, interrupt, stop]);

  // Handle main area click
  const handleMainClick = useCallback(() => {
    if (voiceMode === 'speaking' || isPlaying) {
      interrupt();
    }
  }, [voiceMode, isPlaying, interrupt]);

  // Get state config - using design system colors
  const stateConfig = useMemo(() => {
    switch (voiceMode) {
      case 'listening':
        return {
          label: 'Listening',
          sublabel: inputMode === 'vad' ? 'Speak naturally, I\'ll know when you\'re done' : 'Recording your voice...',
        };
      case 'processing':
        return {
          label: 'Thinking',
          sublabel: 'Processing your request...',
        };
      case 'speaking':
        return {
          label: 'Speaking',
          sublabel: 'Tap anywhere to interrupt',
        };
      case 'interrupted':
        return {
          label: 'Interrupted',
          sublabel: 'Resuming shortly...',
        };
      default:
        return {
          label: 'Ready',
          sublabel: 'Initializing...',
        };
    }
  }, [voiceMode, inputMode]);

  if (!isEnabled) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex flex-col"
        onClick={handleMainClick}
        style={{
          // Apply CSS custom properties for theming
          ['--voice-primary' as string]: colors.primary,
          ['--voice-bg' as string]: colors.bg,
          ['--voice-bg-alt' as string]: colors.bgAlt,
        }}
      >
        {/* Animated gradient background using design tokens */}
        <motion.div
          className="absolute inset-0 transition-all duration-700"
          style={{
            background: `radial-gradient(ellipse at 30% 20%, ${colors.bg}, transparent 60%),
                         radial-gradient(ellipse at 70% 80%, ${colors.bgAlt}, transparent 50%)`,
            backdropFilter: 'blur(60px)',
          }}
        />
        <div className="absolute inset-0 bg-canvas/90" style={{ background: 'color-mix(in oklab, var(--color-canvas) 90%, transparent)' }} />

        {/* Close button - using danger color */}
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          onClick={(e) => {
            e.stopPropagation();
            stop();
          }}
          className="absolute top-6 right-6 z-10 flex items-center gap-2 px-4 py-2 rounded-full transition-colors font-medium"
          style={{
            background: 'color-mix(in oklab, var(--color-danger) 80%, transparent)',
            color: 'white',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-danger)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'color-mix(in oklab, var(--color-danger) 80%, transparent)')}
          aria-label="End conversation"
        >
          <XMarkIcon className="w-5 h-5" />
          <span>End</span>
        </motion.button>

        {/* Main content */}
        <div className="relative flex-1 flex flex-col items-center justify-center px-6">
          {/* Central orb visualization */}
          <motion.div
            className="relative mb-12"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          >
            {/* Outer pulsing rings */}
            {(voiceMode === 'listening' || voiceMode === 'speaking') && (
              <>
                <motion.div
                  className="absolute inset-0 rounded-full"
                  animate={{
                    scale: [1, 1.5 + audioLevel * 0.5],
                    opacity: [0.6, 0],
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: 'easeOut',
                  }}
                  style={{ width: 200, height: 200, margin: -50, background: colors.bg }}
                />
                <motion.div
                  className="absolute inset-0 rounded-full"
                  animate={{
                    scale: [1, 2 + audioLevel * 0.5],
                    opacity: [0.4, 0],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: 'easeOut',
                    delay: 0.5,
                  }}
                  style={{ width: 200, height: 200, margin: -50, background: colors.bgAlt }}
                />
              </>
            )}

            {/* Processing spinner - counter-clockwise */}
            {voiceMode === 'processing' && (
              <motion.div
                className="absolute inset-0 rounded-full"
                animate={{ rotate: -360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                style={{
                  width: 140,
                  height: 140,
                  margin: -20,
                  border: '4px solid color-mix(in oklab, var(--color-accent-2) 30%, transparent)',
                  borderTopColor: 'var(--color-accent-2)',
                }}
              />
            )}

            {/* Main orb */}
            <motion.div
              className="relative w-24 h-24 rounded-full shadow-2xl overflow-hidden"
              animate={{
                scale: 1 + audioLevel * 0.2,
              }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              style={{
                boxShadow: `0 0 0 4px ${colors.primary}`,
              }}
            >
              {/* Inner gradient */}
              <div
                className="absolute inset-0"
                style={{
                  background: `radial-gradient(circle at 30% 30%, ${colors.bg}, ${colors.bgAlt})`,
                }}
              />

              {/* Audio level bars */}
              <div className="absolute inset-0 flex items-center justify-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <motion.div
                    key={i}
                    className="w-1.5 rounded-full"
                    animate={{
                      height: voiceMode === 'listening' || voiceMode === 'speaking'
                        ? 8 + audioLevel * 40 + Math.sin(Date.now() / 200 + i) * 8
                        : voiceMode === 'processing'
                          ? [8, 24, 8]
                          : 8,
                    }}
                    transition={
                      voiceMode === 'processing'
                        ? { duration: 0.6, repeat: Infinity, delay: i * 0.1 }
                        : { type: 'spring', stiffness: 300, damping: 20 }
                    }
                    style={{ background: colors.primary }}
                  />
                ))}
              </div>
            </motion.div>
          </motion.div>

          {/* State label */}
          <motion.div
            key={voiceMode}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-8"
          >
            <h2
              className="text-3xl font-semibold mb-2"
              style={{ color: colors.primary }}
            >
              {stateConfig.label}
            </h2>
            <p className="text-lg" style={{ color: 'var(--color-fg-muted)' }}>
              {stateConfig.sublabel}
            </p>
            {voiceMode === 'listening' && (
              <div className="mt-2 space-y-1">
                <p className="text-sm font-mono" style={{ color: 'color-mix(in oklab, var(--color-fg-muted) 60%, transparent)' }}>
                  {formattedDuration}
                </p>
                <p className="text-xs font-mono" style={{ color: 'color-mix(in oklab, var(--color-fg-muted) 40%, transparent)' }}>
                  {currentDb.toFixed(1)} dB {currentDb > -35 ? '(speech)' : '(silence)'}
                </p>
              </div>
            )}
          </motion.div>

          {/* Transcript display */}
          <motion.div
            className="w-full max-w-2xl mx-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            {/* User transcript */}
            {(finalTranscript || partialTranscript) && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 p-4 rounded-2xl"
                style={{
                  background: 'color-mix(in oklab, var(--color-surface) 8%, transparent)',
                  border: '1px solid color-mix(in oklab, var(--color-border) 30%, transparent)',
                }}
              >
                <p className="text-xs mb-2 uppercase tracking-wider" style={{ color: 'var(--color-fg-muted)' }}>You said</p>
                <p className="text-lg leading-relaxed" style={{ color: 'var(--color-fg)' }}>
                  {finalTranscript || partialTranscript}
                  {!finalTranscript && partialTranscript && (
                    <span className="inline-block w-0.5 h-5 ml-1 animate-pulse" style={{ background: 'var(--color-fg-muted)' }} />
                  )}
                </p>
              </motion.div>
            )}

            {/* AI response */}
            {llmText && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-2xl"
                style={{
                  background: 'color-mix(in oklab, var(--color-surface) 8%, transparent)',
                  border: '1px solid color-mix(in oklab, var(--color-border) 30%, transparent)',
                }}
              >
                <p className="text-xs mb-2 uppercase tracking-wider" style={{ color: 'var(--color-fg-muted)' }}>Response</p>
                <p className="text-lg leading-relaxed" style={{ color: 'var(--color-fg)' }}>
                  {llmText}
                  {voiceMode === 'processing' && (
                    <span className="inline-block w-0.5 h-5 ml-1 animate-pulse" style={{ background: 'var(--color-fg-muted)' }} />
                  )}
                </p>
              </motion.div>
            )}
          </motion.div>

          {/* Error display */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute bottom-32 left-1/2 -translate-x-1/2 px-6 py-3 rounded-xl"
              style={{
                background: 'color-mix(in oklab, var(--color-danger) 20%, transparent)',
                border: '1px solid color-mix(in oklab, var(--color-danger) 30%, transparent)',
              }}
            >
              <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>
            </motion.div>
          )}
        </div>

        {/* Bottom action button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="relative pb-12 flex flex-col items-center gap-4"
        >
          {/* Manual send button when listening - using accent color */}
          {voiceMode === 'listening' && (
            <motion.button
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={(e) => {
                e.stopPropagation();
                finishRecording();
              }}
              className="px-8 py-4 rounded-full font-medium text-lg transition-colors shadow-lg"
              style={{
                background: 'color-mix(in oklab, var(--color-accent) 85%, transparent)',
                color: 'var(--color-canvas)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-accent)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'color-mix(in oklab, var(--color-accent) 85%, transparent)')}
            >
              Done Speaking →
            </motion.button>
          )}

          <p className="text-sm" style={{ color: 'var(--color-fg-muted)' }}>
            {voiceMode === 'listening'
              ? 'Tap "Done Speaking" when finished, or wait for auto-detect'
              : voiceMode === 'speaking'
                ? 'Tap anywhere to interrupt'
                : 'Processing...'}
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default VoiceOverlay;
