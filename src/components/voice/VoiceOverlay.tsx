'use client';

// Module: components/voice/VoiceOverlay
// Responsibility: Full-screen immersive voice conversation interface

import { useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useVoice } from '@/components/voice/VoiceProvider';
import { useChatStore } from '@/lib/store';

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

  // Get state config
  const stateConfig = useMemo(() => {
    switch (voiceMode) {
      case 'listening':
        return {
          label: 'Listening',
          sublabel: inputMode === 'vad' ? 'Speak naturally, I\'ll know when you\'re done' : 'Recording your voice...',
          bgGradient: 'from-rose-500/20 via-red-500/10 to-orange-500/20',
          ringColor: 'ring-rose-500',
          pulseColor: 'bg-rose-500',
          textColor: 'text-rose-400',
        };
      case 'processing':
        return {
          label: 'Thinking',
          sublabel: 'Processing your request...',
          bgGradient: 'from-violet-500/20 via-purple-500/10 to-indigo-500/20',
          ringColor: 'ring-violet-500',
          pulseColor: 'bg-violet-500',
          textColor: 'text-violet-400',
        };
      case 'speaking':
        return {
          label: 'Speaking',
          sublabel: 'Tap anywhere to interrupt',
          bgGradient: 'from-emerald-500/20 via-green-500/10 to-teal-500/20',
          ringColor: 'ring-emerald-500',
          pulseColor: 'bg-emerald-500',
          textColor: 'text-emerald-400',
        };
      case 'interrupted':
        return {
          label: 'Interrupted',
          sublabel: 'Resuming shortly...',
          bgGradient: 'from-amber-500/20 via-yellow-500/10 to-orange-500/20',
          ringColor: 'ring-amber-500',
          pulseColor: 'bg-amber-500',
          textColor: 'text-amber-400',
        };
      default:
        return {
          label: 'Ready',
          sublabel: 'Initializing...',
          bgGradient: 'from-slate-500/20 via-gray-500/10 to-zinc-500/20',
          ringColor: 'ring-slate-500',
          pulseColor: 'bg-slate-500',
          textColor: 'text-slate-400',
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
      >
        {/* Animated gradient background */}
        <motion.div
          className={`absolute inset-0 bg-gradient-to-br ${stateConfig.bgGradient} transition-all duration-700`}
          style={{ backdropFilter: 'blur(60px)' }}
        />
        <div className="absolute inset-0 bg-black/80" />

        {/* Close button - prominent and always visible */}
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          onClick={(e) => {
            e.stopPropagation();
            stop();
          }}
          className="absolute top-6 right-6 z-10 flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/80 hover:bg-red-500 transition-colors text-white font-medium"
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
                  className={`absolute inset-0 rounded-full ${stateConfig.pulseColor}/20`}
                  animate={{
                    scale: [1, 1.5 + audioLevel * 0.5],
                    opacity: [0.6, 0],
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: 'easeOut',
                  }}
                  style={{ width: 200, height: 200, margin: -50 }}
                />
                <motion.div
                  className={`absolute inset-0 rounded-full ${stateConfig.pulseColor}/10`}
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
                  style={{ width: 200, height: 200, margin: -50 }}
                />
              </>
            )}

            {/* Processing spinner */}
            {voiceMode === 'processing' && (
              <motion.div
                className="absolute inset-0 rounded-full border-4 border-violet-500/30 border-t-violet-500"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                style={{ width: 140, height: 140, margin: -20 }}
              />
            )}

            {/* Main orb */}
            <motion.div
              className={`relative w-24 h-24 rounded-full ring-4 ${stateConfig.ringColor} shadow-2xl overflow-hidden`}
              animate={{
                scale: 1 + audioLevel * 0.2,
              }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            >
              {/* Inner gradient */}
              <div className={`absolute inset-0 bg-gradient-to-br ${stateConfig.bgGradient}`} />

              {/* Audio level bars */}
              <div className="absolute inset-0 flex items-center justify-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <motion.div
                    key={i}
                    className={`w-1.5 rounded-full ${stateConfig.pulseColor}`}
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
            <h2 className={`text-3xl font-semibold ${stateConfig.textColor} mb-2`}>
              {stateConfig.label}
            </h2>
            <p className="text-white/60 text-lg">
              {stateConfig.sublabel}
            </p>
            {voiceMode === 'listening' && (
              <div className="mt-2 space-y-1">
                <p className="text-white/40 text-sm font-mono">
                  {formattedDuration}
                </p>
                <p className="text-white/30 text-xs font-mono">
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
                className="mb-6 p-4 rounded-2xl bg-white/5 border border-white/10"
              >
                <p className="text-xs text-white/40 mb-2 uppercase tracking-wider">You said</p>
                <p className="text-white text-lg leading-relaxed">
                  {finalTranscript || partialTranscript}
                  {!finalTranscript && partialTranscript && (
                    <span className="inline-block w-0.5 h-5 bg-white/60 ml-1 animate-pulse" />
                  )}
                </p>
              </motion.div>
            )}

            {/* AI response */}
            {llmText && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-2xl bg-white/5 border border-white/10"
              >
                <p className="text-xs text-white/40 mb-2 uppercase tracking-wider">Response</p>
                <p className="text-white text-lg leading-relaxed">
                  {llmText}
                  {voiceMode === 'processing' && (
                    <span className="inline-block w-0.5 h-5 bg-white/60 ml-1 animate-pulse" />
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
              className="absolute bottom-32 left-1/2 -translate-x-1/2 px-6 py-3 rounded-xl bg-red-500/20 border border-red-500/30"
            >
              <p className="text-red-400 text-sm">{error}</p>
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
          {/* Manual send button when listening */}
          {voiceMode === 'listening' && (
            <motion.button
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={(e) => {
                e.stopPropagation();
                // Manually finish recording and process
                finishRecording();
              }}
              className="px-8 py-4 rounded-full bg-emerald-500/80 hover:bg-emerald-500 text-white font-medium text-lg transition-colors shadow-lg"
            >
              Done Speaking →
            </motion.button>
          )}

          <p className="text-white/40 text-sm">
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
