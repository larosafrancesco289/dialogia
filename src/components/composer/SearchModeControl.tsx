import { useRef, useState } from 'react';
import { GlobeAltIcon } from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';
import { motionTransition } from '@/lib/ui/motion';
import { searchModeLabel } from '@/lib/search/ui/labels';
import { listSearchModeOptions } from '@/lib/search/ui/modes';
import { isNativeSearchMode, type SearchMode } from '@/lib/search/providers/types';
import type { ProviderEndpoint } from '@/lib/transport/endpoints';
import { useProviderKeys } from '@/lib/hooks/useProviderKeys';
import { useDismissOnOutside } from '@/lib/hooks/useDismissOnOutside';
import { ComposerToolLabel } from '@/components/composer/ComposerToolLabel';

/**
 * The composer's web search button: a plain on/off toggle, or a menu of
 * search mechanisms when there is more than one to choose between. Absent when
 * the chosen model's endpoint can search in no way at all.
 */
export function SearchModeControl({
  searchEnabled,
  searchProvider,
  toggleSearch,
  selectSearchMode,
  endpoint,
}: {
  searchEnabled: boolean;
  searchProvider: SearchMode;
  toggleSearch: () => void;
  selectSearchMode: (mode: SearchMode) => void;
  /** Where the chosen model's requests go; undefined offers every mode. */
  endpoint?: ProviderEndpoint;
}) {
  const [searchMenuOpen, setSearchMenuOpen] = useState(false);
  const searchButtonRef = useRef<HTMLButtonElement | null>(null);
  const searchMenuRef = useRef<HTMLDivElement | null>(null);
  // `listSearchModeOptions` reads the key store, which lives outside React:
  // without this subscription a search key pasted in Settings stays invisible
  // here until a reload.
  useProviderKeys();

  useDismissOnOutside({
    open: searchMenuOpen,
    insideRefs: [searchMenuRef, searchButtonRef],
    onOutsidePress: () => setSearchMenuOpen(false),
    onEscape: () => {
      setSearchMenuOpen(false);
      // Focus goes back to the button that opened it, not to the page.
      searchButtonRef.current?.focus();
    },
  });

  const providerLabel = searchModeLabel(searchProvider);
  // With only provider-native search available there is nothing to choose
  // between, so the button stays a plain on/off toggle.
  const searchModes = listSearchModeOptions(endpoint);
  const hasSearchChoice = !(searchModes.length === 1 && isNativeSearchMode(searchModes[0].mode));

  if (searchModes.length === 0) return null;
  const stateLabel = `Web search: ${searchEnabled ? 'on' : 'off'} (${providerLabel})`;

  return (
    <div>
      <button
        ref={searchButtonRef}
        className={`icon-button composer-btn-search ${searchEnabled ? 'is-active' : ''}`}
        aria-pressed={hasSearchChoice ? undefined : searchEnabled}
        aria-haspopup={hasSearchChoice ? 'menu' : undefined}
        aria-expanded={hasSearchChoice ? searchMenuOpen : undefined}
        aria-label={stateLabel}
        title={stateLabel}
        onClick={() => (hasSearchChoice ? setSearchMenuOpen((open) => !open) : toggleSearch())}
      >
        <GlobeAltIcon className="h-4 w-4" aria-hidden="true" />
        <ComposerToolLabel text={searchEnabled ? 'Search' : null} />
      </button>
      <AnimatePresence>
        {hasSearchChoice && searchMenuOpen && (
          <motion.div
            ref={searchMenuRef}
            role="menu"
            aria-label="Web search"
            className="popover popover--motion absolute bottom-full left-0 z-30 mb-2 w-56 p-1"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={motionTransition.quick}
          >
            <button
              type="button"
              role="menuitemradio"
              aria-checked={!searchEnabled}
              className="menu-item w-full text-left text-sm"
              onClick={() => {
                if (searchEnabled) toggleSearch();
                setSearchMenuOpen(false);
              }}
            >
              Off
            </button>
            {searchModes.map((option) => (
              <button
                key={option.mode}
                type="button"
                role="menuitemradio"
                aria-checked={searchEnabled && searchProvider === option.mode}
                className="menu-item w-full text-left text-sm"
                onClick={() => {
                  selectSearchMode(option.mode);
                  setSearchMenuOpen(false);
                }}
              >
                {option.label}
                <span className="block text-xs text-fg-muted">{option.description}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
