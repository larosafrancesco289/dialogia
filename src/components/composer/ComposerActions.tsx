import { ArrowUpIcon, BookmarkIcon, StopIcon, PaperClipIcon } from '@heroicons/react/24/outline';
import { ComposerToolLabel } from '@/components/composer/ComposerToolLabel';
import type { SearchMode } from '@/lib/search/providers/types';
import type { ReasoningEffort } from '@/lib/types';
import type { ProviderEndpoint } from '@/lib/transport/endpoints';
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
  /** Where the chosen model's requests go, which decides what search it can do. */
  modelEndpoint?: ProviderEndpoint;
  showReasoningMenu: boolean;
  availableEfforts?: ReasoningEffort[];
  defaultEffort?: ReasoningEffort;
  currentEffort?: ReasoningEffort;
  onSelectEffort: (effort: ReasoningEffort) => Promise<void> | void;
  hasContent?: boolean;
  /** Whether this chat reads and writes memory; absent while memory is off everywhere. */
  memoryOn?: boolean;
  toggleMemory: () => void;
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
  modelEndpoint,
  showReasoningMenu,
  availableEfforts,
  defaultEffort,
  currentEffort,
  onSelectEffort,
  hasContent,
  memoryOn,
  toggleMemory,
}: ComposerActionsProps) {
  if (isStreaming) {
    return (
      <div className="composer-tools composer-tools--swap">
        <button
          type="button"
          className="composer-btn-stop"
          onClick={onStop}
          aria-label="Stop the reply"
          title="Stop the reply"
        >
          <StopIcon className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (writingInOtherTab) {
    return (
      <div className="composer-tools composer-tools--swap" role="status">
        <span className="composer-tools__status">Writing in another tab…</span>
      </div>
    );
  }

  return (
    <div className="composer-tools composer-tools--swap">
      <div className="composer-tools__left">
        <button
          type="button"
          className="icon-button composer-btn-attach"
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
          endpoint={modelEndpoint}
        />

        {/* On is the usual state and stays quiet; a chat kept out of memory says so. */}
        {memoryOn !== undefined && (
          <button
            type="button"
            className={`icon-button composer-btn-memory${memoryOn ? '' : ' is-active'}`}
            aria-pressed={!memoryOn}
            aria-label="Keep this chat out of memory"
            title={
              memoryOn
                ? 'Memory: on in this chat. Turn off to keep it out of memory.'
                : 'Memory: off in this chat. Nothing is read or remembered.'
            }
            onClick={toggleMemory}
          >
            <BookmarkIcon className="h-4 w-4" aria-hidden="true" />
            <ComposerToolLabel text={memoryOn ? null : 'Memory off'} />
          </button>
        )}

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
        <ArrowUpIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
