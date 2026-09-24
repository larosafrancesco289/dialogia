import { useRef, useState } from 'react';
import { GlobeAltIcon } from '@heroicons/react/24/outline';
import { GlobeAltIcon as GlobeSolidIcon } from '@heroicons/react/24/solid';
import { motion, AnimatePresence } from 'framer-motion';
import { springs } from '@/lib/mobile/springConfig';
import { searchModeLabel } from '@/lib/search/ui/labels';
import { listSearchModeOptions } from '@/lib/search/ui/modes';
import type { SearchMode } from '@/lib/search/providers/types';
import { useProviderKeys } from '@/lib/hooks/useProviderKeys';
import { useDismissOnOutside } from '@/lib/hooks/useDismissOnOutside';

// ─────────────────────────────────────────────────────────────────────────────
// Web search — globe toggle. Same physical-icon language as the reasoning bulb:
// off is a thin outline, on is the solid glyph in accent.
// ─────────────────────────────────────────────────────────────────────────────

function SearchGlobeIcon({ enabled, size = 16 }: { enabled: boolean; size?: number }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={enabled ? 'on' : 'off'}
        initial={{ opacity: 0, scale: 0.82, rotate: enabled ? -24 : 24 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        exit={{ opacity: 0, scale: 0.82, rotate: enabled ? 24 : -24 }}
        transition={{ duration: 0.14 }}
        className="composer-search-icon"
      >
        {enabled ? (
          <GlobeSolidIcon width={size} height={size} />
        ) : (
          <GlobeAltIcon width={size} height={size} strokeWidth={1.5} />
        )}
      </motion.span>
    </AnimatePresence>
  );
}

/**
 * The composer's web search button: a plain on/off toggle, or a menu of
 * search mechanisms when there is more than one to choose between.
 */
export function SearchModeControl({
  searchEnabled,
  searchProvider,
  toggleSearch,
  selectSearchMode,
}: {
  searchEnabled: boolean;
  searchProvider: SearchMode;
  toggleSearch: () => void;
  selectSearchMode: (mode: SearchMode) => void;
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
  const searchModes = listSearchModeOptions();
  const hasSearchChoice = searchModes.length > 1;

  return (
    <div>
      <button
        ref={searchButtonRef}
        className={`composer-btn-search ${searchEnabled ? 'is-active' : ''}`}
        aria-pressed={hasSearchChoice ? undefined : searchEnabled}
        aria-haspopup={hasSearchChoice ? 'menu' : undefined}
        aria-expanded={hasSearchChoice ? searchMenuOpen : undefined}
        aria-label="Web search"
        title={
          searchEnabled ? `Web search: on (${providerLabel})` : `Web search: off (${providerLabel})`
        }
        onClick={() => (hasSearchChoice ? setSearchMenuOpen((open) => !open) : toggleSearch())}
      >
        <SearchGlobeIcon enabled={searchEnabled} size={16} />
        {searchEnabled && <span className="composer-tool-label">Search</span>}
      </button>
      <AnimatePresence>
        {hasSearchChoice && searchMenuOpen && (
          <motion.div
            ref={searchMenuRef}
            role="menu"
            aria-label="Web search"
            className="popover absolute bottom-full left-0 z-30 mb-2 w-56 p-1"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={springs.snappy}
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
                <span className="block text-xs text-muted-foreground">{option.description}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
