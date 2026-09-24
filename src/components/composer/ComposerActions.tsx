import { StopIcon, PaperClipIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline';
import type { SearchMode } from '@/lib/search/providers/types';
import type { ReasoningEffort } from '@/lib/types';
import { ReasoningEffortControl } from '@/components/composer/ReasoningEffortControl';
import { SearchModeControl } from '@/components/composer/SearchModeControl';

export type ComposerActionsProps = {
  isStreaming: boolean;
  /**
   * Another tab is writing a reply in this chat. Sending here would interleave
   * a second turn with it, and this tab cannot stop it, so there is no button.
   */
  writingInOtherTab?: boolean;
  onStop: () => void;
  onSend: () => void;
  openFilePicker: () => void;
  attachmentsHint: string;
  searchEnabled: boolean;
  searchProvider: SearchMode;
  toggleSearch: () => void;
  /** Turns search on with a specific mechanism; only shown when there is a choice. */
  selectSearchMode: (mode: SearchMode) => void;
  showReasoningMenu: boolean;
  availableEfforts?: ReasoningEffort[];
  defaultEffort?: ReasoningEffort;
  currentEffort?: ReasoningEffort;
  onSelectEffort: (effort: ReasoningEffort) => Promise<void> | void;
  hasContent?: boolean;
};

export function ComposerActions({
  isStreaming,
  writingInOtherTab,
  onStop,
  onSend,
  openFilePicker,
  attachmentsHint,
  searchEnabled,
  searchProvider,
  toggleSearch,
  selectSearchMode,
  showReasoningMenu,
  availableEfforts,
  defaultEffort,
  currentEffort,
  onSelectEffort,
  hasContent,
}: ComposerActionsProps) {
  if (isStreaming) {
    return (
      <div className="composer-tools">
        <span className="composer-tools__status">Writing…</span>
        <button
          type="button"
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

  if (writingInOtherTab) {
    return (
      <div className="composer-tools" role="status">
        <span className="composer-tools__status">Writing in another tab…</span>
      </div>
    );
  }

  return (
    <div className="composer-tools">
      <div className="composer-tools__left">
        <button
          type="button"
          className="composer-btn-attach"
          aria-label="Attach files"
          title={attachmentsHint || 'Attach files'}
          onClick={openFilePicker}
        >
          <PaperClipIcon className="h-4 w-4" />
        </button>

        {/* The controls' wrappers are not positioned: their menus anchor to
            the composer itself, so they open above the whole composer
            instead of over the words. */}
        <SearchModeControl
          searchEnabled={searchEnabled}
          searchProvider={searchProvider}
          toggleSearch={toggleSearch}
          selectSearchMode={selectSearchMode}
        />

        {showReasoningMenu && (
          <ReasoningEffortControl
            availableEfforts={availableEfforts}
            defaultEffort={defaultEffort}
            currentEffort={currentEffort}
            onSelectEffort={onSelectEffort}
          />
        )}
      </div>

      <button
        type="button"
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
