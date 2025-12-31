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
} from '@heroicons/react/24/outline';
import { useChatStore } from '@/lib/store';
import { useXAIVoice } from '@/lib/hooks/useXAIVoice';
import { useCanUseVoice, useIsStudyTier } from '@/lib/auth/tierContext';
import type { Effort } from '@/components/composer/ComposerMobileMenu';

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
  currentEffort,
  onSelectEffort,
  hasContent,
}: ComposerActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Check if voice mode is available for the current tier
  const canUseVoice = useCanUseVoice();
  // Check if user is in study tier (hide certain features)
  const isStudyTier = useIsStudyTier();

  // Voice hook lifted here so it doesn't unmount when menu closes
  const addVoiceUserMessage = useChatStore((s) => s.addVoiceUserMessage);
  const addVoiceAssistantMessage = useChatStore((s) => s.addVoiceAssistantMessage);
  const ensureChatForVoice = useChatStore((s) => s.ensureChatForVoice);
  const { start: startVoice, stop: stopVoice } = useXAIVoice({
    onUserMessage: (content: string) => addVoiceUserMessage(content),
    onAssistantMessage: (content: string) => addVoiceAssistantMessage(content),
  });

  // Close menu on outside click
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
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [menuOpen]);

  // Voice state for surfacing active indicator
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

  return (
    <div className="flex items-center gap-1.5">
      {/* Voice status pill — only visible when voice is active and tier allows it */}
      {canUseVoice && isVoiceActive && <VoiceStatusPill onStop={stopVoice} />}

      {/* Overflow menu button — hide when voice is active */}
      {!isVoiceActive && (
        <div className="relative">
          <button
            ref={menuButtonRef}
            className={`composer-btn-overflow ${menuOpen ? 'is-open' : ''}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="More actions"
            title="More actions"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <EllipsisHorizontalIcon className="h-4 w-4" />
            {/* Indicator dot when search is enabled (not shown for study tier) */}
            {searchEnabled && !isStudyTier && (
              <span className="composer-btn-overflow__indicator" aria-hidden="true" />
            )}
          </button>

          {/* Overflow menu popover */}
          {menuOpen && (
            <div
              ref={menuRef}
              role="menu"
              className="composer-overflow-menu"
              aria-label="Composer actions"
            >
              {/* Attach files */}
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

              {/* Web search toggle — hidden for study tier */}
              {!isStudyTier && (
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
              )}

              {/* Voice mode — only shown for developer tier */}
              {canUseVoice && (
                <VoiceMenuItem
                  onStart={async () => {
                    await ensureChatForVoice();
                    await startVoice();
                  }}
                  onClose={() => setMenuOpen(false)}
                />
              )}

              {/* Reasoning effort */}
              {showReasoningMenu && (
                <>
                  <div className="composer-overflow-divider" />
                  <div className="composer-overflow-label">Reasoning effort</div>
                  {(['none', 'low', 'medium', 'high'] as Effort[]).map((effort) => (
                    <button
                      key={effort}
                      className={`composer-overflow-item ${currentEffort === effort ? 'is-active' : ''}`}
                      role="menuitemradio"
                      aria-checked={currentEffort === effort}
                      onClick={() => {
                        void onSelectEffort(effort);
                        setMenuOpen(false);
                      }}
                    >
                      <span>
                        {effort === 'none'
                          ? 'Off'
                          : effort.charAt(0).toUpperCase() + effort.slice(1)}
                      </span>
                      {currentEffort === effort && <CheckIcon className="h-3.5 w-3.5 ml-auto" />}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Primary send button */}
      <button
        className={`composer-btn-send ${hasContent ? 'has-content' : ''}`}
        onMouseDown={(e) => {
          // Prevent blur of textarea before click registers
          e.preventDefault();
        }}
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

/** Voice status pill — visible in main row when voice is active */
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

/** Voice menu item */
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
