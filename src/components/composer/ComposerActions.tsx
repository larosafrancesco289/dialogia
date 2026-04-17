'use client';
import { useEffect, useRef, useState } from 'react';
import {
  StopIcon,
  MagnifyingGlassIcon,
  PaperClipIcon,
  PaperAirplaneIcon,
  MicrophoneIcon,
  EllipsisHorizontalIcon,
  CheckIcon,
  XMarkIcon,
  LightBulbIcon,
} from '@heroicons/react/24/outline';
import { LightBulbIcon as LightBulbSolidIcon } from '@heroicons/react/24/solid';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from '@/lib/store';
import { useXAIVoice } from '@/lib/hooks/useXAIVoice';
import { useCanUseVoice, useIsStudyTier } from '@/lib/auth/tierContext';
import { springs } from '@/lib/mobile/springConfig';
import type { Effort } from '@/components/composer/ComposerMobileMenu';

const EFFORT_DOTS: Record<Effort, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  xhigh: 4,
};

const menuContainerVariants = {
  hidden: { opacity: 0, y: 6, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring' as const,
      stiffness: 400,
      damping: 30,
      staggerChildren: 0.03,
    },
  },
  exit: {
    opacity: 0,
    y: 4,
    scale: 0.97,
    transition: { duration: 0.12 },
  },
};

const menuItemVariants = {
  hidden: { opacity: 0, y: 4 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 400, damping: 30 },
  },
};

export type ComposerActionsProps = {
  isStreaming: boolean;
  onStop: () => void;
  onSend: () => void;
  openFilePicker: () => void;
  attachmentsHint: string;
  searchEnabled: boolean;
  searchProvider: 'brave' | 'openrouter';
  toggleSearch: () => void;
  showReasoningMenu: boolean;
  supportsXhigh?: boolean;
  currentEffort?: Effort;
  onSelectEffort: (effort: Effort) => Promise<void> | void;
  hasContent?: boolean;
};

export function ComposerActions({
  isStreaming,
  onStop,
  onSend,
  openFilePicker,
  attachmentsHint: _attachmentsHint,
  searchEnabled,
  searchProvider: _searchProvider,
  toggleSearch,
  showReasoningMenu,
  supportsXhigh,
  currentEffort,
  onSelectEffort,
  hasContent,
}: ComposerActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const [reasoningOpen, setReasoningOpen] = useState(false);
  const reasoningButtonRef = useRef<HTMLButtonElement | null>(null);
  const reasoningMenuRef = useRef<HTMLDivElement | null>(null);

  const canUseVoice = useCanUseVoice();
  const isStudyTier = useIsStudyTier();

  const addVoiceUserMessage = useChatStore((s) => s.addVoiceUserMessage);
  const addVoiceAssistantMessage = useChatStore((s) => s.addVoiceAssistantMessage);
  const ensureChatForVoice = useChatStore((s) => s.ensureChatForVoice);
  const { start: startVoice, stop: stopVoice } = useXAIVoice({
    onUserMessage: (content: string) => addVoiceUserMessage(content),
    onAssistantMessage: (content: string) => addVoiceAssistantMessage(content),
  });

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const menu = menuRef.current;
      const trigger = menuButtonRef.current;
      const target = event.target as Node | null;
      const inMenu = !!(menu && target && menu.contains(target));
      const inTrigger = !!(trigger && target && trigger.contains(target));
      if (!inMenu && !inTrigger) setMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!reasoningOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const menu = reasoningMenuRef.current;
      const trigger = reasoningButtonRef.current;
      const target = event.target as Node | null;
      const inMenu = !!(menu && target && menu.contains(target));
      const inTrigger = !!(trigger && target && trigger.contains(target));
      if (!inMenu && !inTrigger) setReasoningOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setReasoningOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [reasoningOpen]);

  const isVoiceActive = useChatStore((s) => s.voice.isActive);

  if (isStreaming) {
    return (
      <div className="flex items-center gap-2">
        <button
          className="composer-btn-stop"
          onClick={onStop}
          aria-label="Stop generating"
          title="Stop"
        >
          <StopIcon className="h-4 w-4" />
        </button>
      </div>
    );
  }

  const reasoningActive = !!currentEffort && currentEffort !== 'none';
  const effortLabel = (e: Effort) =>
    e === 'none' ? 'Off' : e === 'xhigh' ? 'Extra High' : e.charAt(0).toUpperCase() + e.slice(1);

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {canUseVoice && isVoiceActive && <VoiceStatusPill onStop={stopVoice} />}

      {!isVoiceActive && showReasoningMenu && (
        <div className="relative">
          <button
            ref={reasoningButtonRef}
            className={`composer-btn-reasoning ${reasoningActive ? 'is-active' : ''} ${reasoningOpen ? 'is-open' : ''}`}
            data-effort={currentEffort ?? 'none'}
            aria-haspopup="menu"
            aria-expanded={reasoningOpen}
            aria-label="Reasoning effort"
            title={
              reasoningActive ? `Reasoning: ${effortLabel(currentEffort!)}` : 'Reasoning effort'
            }
            onClick={() => {
              setReasoningOpen((v) => !v);
              setMenuOpen(false);
            }}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={reasoningActive ? 'solid' : 'outline'}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.12 }}
                className="flex items-center justify-center"
              >
                {reasoningActive ? (
                  <LightBulbSolidIcon className="h-4 w-4" />
                ) : (
                  <LightBulbIcon className="h-4 w-4" />
                )}
              </motion.span>
            </AnimatePresence>
          </button>

          <AnimatePresence>
            {reasoningOpen && (
              <motion.div
                ref={reasoningMenuRef}
                variants={menuContainerVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                role="menu"
                className="composer-reasoning-menu"
                aria-label="Reasoning effort"
              >
                <motion.div variants={menuItemVariants} className="composer-overflow-label">
                  Reasoning effort
                </motion.div>
                {(supportsXhigh
                  ? (['none', 'low', 'medium', 'high', 'xhigh'] as Effort[])
                  : (['none', 'low', 'medium', 'high'] as Effort[])
                ).map((effort) => (
                  <motion.button
                    key={effort}
                    variants={menuItemVariants}
                    className={`composer-overflow-item composer-reasoning-item ${currentEffort === effort ? 'is-active' : ''}`}
                    role="menuitemradio"
                    aria-checked={currentEffort === effort}
                    onClick={() => {
                      void onSelectEffort(effort);
                      setReasoningOpen(false);
                    }}
                  >
                    {currentEffort === effort && (
                      <motion.span
                        layoutId="effort-highlight"
                        className="composer-effort-highlight"
                        transition={springs.snappy}
                      />
                    )}
                    <span className="relative z-[1]">{effortLabel(effort)}</span>
                    {EFFORT_DOTS[effort] > 0 && (
                      <span className="composer-effort-dots relative z-[1]">
                        {Array.from({ length: EFFORT_DOTS[effort] }, (_, i) => (
                          <span key={i} className="composer-effort-dot" />
                        ))}
                      </span>
                    )}
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {!isVoiceActive && (
        <div className="relative">
          <button
            ref={menuButtonRef}
            className={`composer-btn-overflow ${menuOpen ? 'is-open' : ''}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="More actions"
            title="More actions"
            onClick={() => {
              setMenuOpen((v) => !v);
              setReasoningOpen(false);
            }}
          >
            <EllipsisHorizontalIcon className="h-4 w-4" />
            {searchEnabled && !isStudyTier && (
              <span className="composer-btn-overflow__indicator" aria-hidden="true" />
            )}
          </button>

          <AnimatePresence>
            {menuOpen && (
              <motion.div
                ref={menuRef}
                variants={menuContainerVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                role="menu"
                className="composer-overflow-menu"
                aria-label="Composer actions"
              >
                <motion.div variants={menuItemVariants}>
                  <button
                    className="composer-overflow-item"
                    role="menuitem"
                    onClick={() => {
                      openFilePicker();
                      setMenuOpen(false);
                    }}
                  >
                    <PaperClipIcon className="h-4 w-4" />
                    <span>Attach files</span>
                  </button>
                </motion.div>

                {!isStudyTier && (
                  <motion.div variants={menuItemVariants}>
                    <button
                      className={`composer-overflow-item ${searchEnabled ? 'is-active' : ''}`}
                      role="menuitemcheckbox"
                      aria-checked={searchEnabled}
                      onClick={() => {
                        toggleSearch();
                      }}
                    >
                      <MagnifyingGlassIcon className="h-4 w-4" />
                      <span>Web search</span>
                      {searchEnabled && <CheckIcon className="h-3.5 w-3.5 ml-auto" />}
                    </button>
                  </motion.div>
                )}

                {canUseVoice && (
                  <motion.div variants={menuItemVariants}>
                    <VoiceMenuItem
                      onStart={async () => {
                        await ensureChatForVoice();
                        await startVoice();
                      }}
                      onClose={() => setMenuOpen(false)}
                    />
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <button
        className={`composer-btn-send ${hasContent ? 'has-content' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onSend}
        aria-label="Send message"
        title="Send"
        disabled={!hasContent}
      >
        <PaperAirplaneIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

function VoiceStatusPill({ onStop }: { onStop: () => void }) {
  const isConnected = useChatStore((s) => s.voice.isConnected);
  const isListening = useChatStore((s) => s.voice.isListening);
  const isSpeaking = useChatStore((s) => s.voice.isSpeaking);
  const error = useChatStore((s) => s.voice.error);

  const getStatusText = () => {
    if (error) return 'Error';
    if (isSpeaking) return 'Speaking';
    if (isListening) return 'Listening';
    if (isConnected) return 'Connected';
    return 'Connecting';
  };

  const getStatusClass = () => {
    if (error) return 'is-error';
    if (isSpeaking) return 'is-speaking';
    if (isListening) return 'is-listening';
    return '';
  };

  return (
    <button
      className={`composer-voice-pill ${getStatusClass()}`}
      onClick={onStop}
      aria-label="Stop voice mode"
      title="Click to stop voice mode"
    >
      <span className="composer-voice-pill__indicator" />
      <MicrophoneIcon className="h-3.5 w-3.5" />
      <span className="composer-voice-pill__text">{getStatusText()}</span>
      <XMarkIcon className="h-3.5 w-3.5 composer-voice-pill__close" />
    </button>
  );
}

function VoiceMenuItem({
  onStart,
  onClose,
}: {
  onStart: () => Promise<void>;
  onClose: () => void;
}) {
  const handleClick = async () => {
    await onStart();
    onClose();
  };

  return (
    <button className="composer-overflow-item" role="menuitem" onClick={handleClick}>
      <MicrophoneIcon className="h-4 w-4" />
      <span>Voice mode</span>
    </button>
  );
}
