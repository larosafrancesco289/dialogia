'use client';
import { useRef, useState } from 'react';
import {
  StopIcon,
  MagnifyingGlassIcon,
  PaperClipIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline';
import { ReasoningEffortMenu } from '@/components/ReasoningEffortMenu';
import { ComposerMobileMenu, type Effort } from '@/components/composer/ComposerMobileMenu';

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
};

export function ComposerActions({
  isStreaming,
  onStop,
  onSend,
  openFilePicker,
  attachmentsHint,
  searchEnabled,
  searchProvider,
  toggleSearch,
  showReasoningMenu,
  currentEffort,
  onSelectEffort,
}: ComposerActionsProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement | null>(null);

  if (isStreaming) {
    return (
      <button className="btn btn-outline self-center" onClick={onStop} aria-label="Stop">
        <StopIcon className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="hidden sm:flex items-center gap-2">
        <button
          className="btn btn-outline self-center"
          type="button"
          title={attachmentsHint}
          onClick={openFilePicker}
          aria-label="Attach files"
        >
          <PaperClipIcon className="h-4 w-4" />
        </button>
        <button
          className={`btn self-center ${searchEnabled ? 'btn-primary' : 'btn-outline'}`}
          onClick={toggleSearch}
          title={`Use web search (${searchProvider === 'openrouter' ? 'OpenRouter' : 'Brave'}) to augment the next message`}
          aria-label={`Toggle ${searchProvider === 'openrouter' ? 'OpenRouter' : 'Brave'} Search`}
          aria-pressed={!!searchEnabled}
        >
          <MagnifyingGlassIcon className="h-4 w-4" />
        </button>
        {showReasoningMenu && <ReasoningEffortMenu />}
      </div>

      <ComposerMobileMenu
        isOpen={mobileMenuOpen}
        onToggle={() => setMobileMenuOpen((value) => !value)}
        onClose={() => setMobileMenuOpen(false)}
        buttonRef={mobileMenuButtonRef}
        onAttachClick={() => {
          openFilePicker();
          setMobileMenuOpen(false);
        }}
        searchEnabled={searchEnabled}
        searchProvider={searchProvider}
        toggleSearch={toggleSearch}
        showReasoningMenu={showReasoningMenu}
        currentEffort={currentEffort}
        onSelectEffort={(effort) => {
          void onSelectEffort(effort);
          setMobileMenuOpen(false);
        }}
      />

      <button className="btn self-center" onClick={onSend} aria-label="Send" title="Send">
        <PaperAirplaneIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
