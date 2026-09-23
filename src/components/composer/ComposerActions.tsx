import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { searchModeLabel } from '@/lib/search/ui/labels';
import { listSearchModeOptions } from '@/lib/search/ui/modes';
import { useProviderKeys } from '@/lib/hooks/useProviderKeys';
import type { SearchMode } from '@/lib/search/providers/types';
import type { RefObject } from 'react';
import {
  StopIcon,
  GlobeAltIcon,
  PaperClipIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline';
import {
  LightBulbIcon as LightBulbSolidIcon,
  GlobeAltIcon as GlobeSolidIcon,
} from '@heroicons/react/24/solid';
import { Lightbulb as LucideLightbulb, LightbulbOff as LucideLightbulbOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { springs } from '@/lib/mobile/springConfig';
import type { ReasoningEffort } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Reasoning effort: "Lightbulb, off to radiant". The icon fills in along the
// effort scale (off, outline, bold outline, solid, larger solid), in ink.
// ─────────────────────────────────────────────────────────────────────────────

/** Close a composer popover on an outside pointer press or Escape. */
function useDismissOnOutside(
  open: boolean,
  setOpen: (open: boolean) => void,
  menuRef: RefObject<HTMLElement | null>,
  triggerRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      const inMenu = !!(menuRef.current && target && menuRef.current.contains(target));
      const inTrigger = !!(triggerRef.current && target && triggerRef.current.contains(target));
      if (!inMenu && !inTrigger) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        // Focus goes back to the button that opened it, not to the page.
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open, setOpen, menuRef, triggerRef]);
}

const effortLabel = (e: ReasoningEffort) =>
  e === 'none' ? 'Off' : e === 'xhigh' ? 'Extra high' : e.charAt(0).toUpperCase() + e.slice(1);

type BulbKind = 'off' | 'outline' | 'outline-bold' | 'solid' | 'solid-plus';

const EFFORT_KIND: Record<ReasoningEffort, BulbKind> = {
  none: 'off',
  minimal: 'outline',
  low: 'outline',
  medium: 'outline-bold',
  high: 'solid',
  xhigh: 'solid-plus',
  max: 'solid-plus',
};

const DEFAULT_EFFORTS: ReasoningEffort[] = ['none', 'low', 'medium', 'high'];

function ReasoningBulbIcon({ effort, size = 16 }: { effort: ReasoningEffort; size?: number }) {
  const kind = EFFORT_KIND[effort];
  let node: React.ReactNode;
  switch (kind) {
    case 'off':
      node = <LucideLightbulbOff size={size} strokeWidth={1.5} />;
      break;
    case 'outline':
      node = <LucideLightbulb size={size} strokeWidth={1.5} />;
      break;
    case 'outline-bold':
      node = <LucideLightbulb size={size} strokeWidth={2} />;
      break;
    case 'solid':
      node = <LightBulbSolidIcon width={size} height={size} />;
      break;
    case 'solid-plus':
      node = <LightBulbSolidIcon width={size} height={size} />;
      break;
  }
  const scale = kind === 'solid-plus' ? 1.12 : 1;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={kind}
        initial={{ opacity: 0, scale: scale * 0.82 }}
        animate={{ opacity: 1, scale }}
        exit={{ opacity: 0, scale: scale * 0.82 }}
        transition={{ duration: 0.14 }}
        className="composer-reasoning-icon"
      >
        {node}
      </motion.span>
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reasoning effort: an upright scale in a popover, rising from the button:
// Off at the foot, the most thought at the head. Stops sit on a hairline rail
// filled in ink up to the level in use; each is named beside its stop, the
// model's default marked in rubric; one italic line says what the pointed-at
// level does. Arrow keys walk the scale.
// ─────────────────────────────────────────────────────────────────────────────

const EFFORT_HINT: Record<ReasoningEffort, string> = {
  none: 'Answer straight away',
  minimal: 'The lightest thought',
  low: 'A quick think first',
  medium: 'Think it through',
  high: 'Think hard',
  xhigh: 'Think very hard',
  max: 'Take all the time it needs',
};

type ReasoningMenuProps = {
  availableEfforts?: ReasoningEffort[];
  defaultEffort?: ReasoningEffort;
  currentEffort?: ReasoningEffort;
  onSelect: (e: ReasoningEffort) => void;
  onClose: () => void;
  menuRef: RefObject<HTMLDivElement>;
};

function ReasoningMenu({
  availableEfforts,
  defaultEffort,
  currentEffort,
  onSelect,
  onClose,
  menuRef,
}: ReasoningMenuProps) {
  const efforts: ReasoningEffort[] = availableEfforts?.length ? availableEfforts : DEFAULT_EFFORTS;
  const currentIndex = Math.max(0, efforts.indexOf(currentEffort ?? 'none'));
  const [focusIndex, setFocusIndex] = useState(currentIndex);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [shift, setShift] = useState(0);
  const shown = efforts[previewIndex ?? currentIndex];
  const stopsRef = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    stopsRef.current[currentIndex]?.focus();
  }, [currentIndex]);

  // Keep the scale on screen: the button may sit anywhere along the row.
  useLayoutEffect(() => {
    const rect = menuRef.current?.getBoundingClientRect();
    if (!rect) return;
    const overflow = rect.right - (window.innerWidth - 12);
    if (overflow > 0) setShift(-Math.min(overflow, rect.left - 12));
  }, [menuRef]);

  const move = (to: number) => {
    const next = Math.max(0, Math.min(efforts.length - 1, to));
    setFocusIndex(next);
    setPreviewIndex(next);
    stopsRef.current[next]?.focus();
  };

  // The filled part of the rail rises from the lowest stop to the chosen one.
  const fill = efforts.length > 1 ? (currentIndex / (efforts.length - 1)) * 100 : 0;
  // Drawn top-down, so the list runs from the most thought to none.
  const rows = efforts.map((e, index) => ({ e, index })).reverse();

  return (
    <motion.div
      ref={menuRef}
      role="radiogroup"
      aria-label="Reasoning effort"
      className="popover reasoning-scale absolute bottom-full left-0 z-30 mb-2"
      style={{ ['--stops' as string]: efforts.length, translate: `${shift}px 0` }}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={springs.snappy}
      onKeyDown={(event) => {
        // Read the position from focus, not state, so quick presses add up.
        const at = stopsRef.current.indexOf(document.activeElement as HTMLButtonElement);
        const from = at >= 0 ? at : focusIndex;
        if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
          event.preventDefault();
          move(from + 1);
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
          event.preventDefault();
          move(from - 1);
        } else if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          const chosen = efforts[from];
          if (chosen) {
            onSelect(chosen);
            onClose();
          }
        } else if (event.key === 'Home') {
          event.preventDefault();
          move(0);
        } else if (event.key === 'End') {
          event.preventDefault();
          move(efforts.length - 1);
        }
      }}
      onMouseLeave={() => setPreviewIndex(null)}
    >
      <div className="reasoning-scale__head">
        <span className="menu-heading p-0">Reasoning</span>
        <span className="reasoning-scale__hint" aria-live="polite">
          {EFFORT_HINT[shown]}
        </span>
      </div>
      <div className="reasoning-scale__stops">
        <span className="reasoning-scale__rail" aria-hidden="true">
          <span className="reasoning-scale__fill" style={{ height: `${fill}%` }} />
        </span>
        {rows.map(({ e, index }) => (
          <button
            key={e}
            ref={(node) => {
              stopsRef.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={index === currentIndex}
            tabIndex={index === focusIndex ? 0 : -1}
            className={`reasoning-scale__stop${index <= currentIndex ? ' is-filled' : ''}${
              index === currentIndex ? ' is-current' : ''
            }`}
            aria-label={defaultEffort === e ? `${effortLabel(e)} (model default)` : effortLabel(e)}
            onMouseEnter={() => setPreviewIndex(index)}
            onFocus={() => setPreviewIndex(index)}
            onClick={() => {
              onSelect(e);
              onClose();
            }}
          >
            <span className="reasoning-scale__dot" aria-hidden="true" />
            <span className="reasoning-scale__label">{effortLabel(e)}</span>
            {defaultEffort === e && (
              <span className="reasoning-scale__default" title="The model's default">
                default
              </span>
            )}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

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

export type ComposerActionsProps = {
  isStreaming: boolean;
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
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const reasoningButtonRef = useRef<HTMLButtonElement | null>(null);
  const reasoningMenuRef = useRef<HTMLDivElement | null>(null);
  const [searchMenuOpen, setSearchMenuOpen] = useState(false);
  const searchButtonRef = useRef<HTMLButtonElement | null>(null);
  const searchMenuRef = useRef<HTMLDivElement | null>(null);
  // `listSearchModeOptions` reads the key store, which lives outside React:
  // without this subscription a search key pasted in Settings stays invisible
  // here until a reload.
  useProviderKeys();

  useDismissOnOutside(reasoningOpen, setReasoningOpen, reasoningMenuRef, reasoningButtonRef);
  useDismissOnOutside(searchMenuOpen, setSearchMenuOpen, searchMenuRef, searchButtonRef);

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

  const effort: ReasoningEffort = currentEffort ?? 'none';
  const reasoningActive = effort !== 'none';

  const providerLabel = searchModeLabel(searchProvider);
  // With only provider-native search available there is nothing to choose
  // between, so the button stays a plain on/off toggle.
  const searchModes = listSearchModeOptions();
  const hasSearchChoice = searchModes.length > 1;

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

        {/* Not positioned: the menus anchor to the composer itself, so they
            open above the whole composer instead of over the words. */}
        <div>
          <button
            ref={searchButtonRef}
            className={`composer-btn-search ${searchEnabled ? 'is-active' : ''}`}
            aria-pressed={hasSearchChoice ? undefined : searchEnabled}
            aria-haspopup={hasSearchChoice ? 'menu' : undefined}
            aria-expanded={hasSearchChoice ? searchMenuOpen : undefined}
            aria-label="Web search"
            title={
              searchEnabled
                ? `Web search: on (${providerLabel})`
                : `Web search: off (${providerLabel})`
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
                    <span className="block text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {showReasoningMenu && (
          <div>
            <button
              ref={reasoningButtonRef}
              className={`composer-btn-reasoning ${reasoningActive ? 'is-active' : ''} ${reasoningOpen ? 'is-open' : ''}`}
              data-effort={effort}
              aria-haspopup="true"
              aria-expanded={reasoningOpen}
              aria-label="Reasoning effort"
              title={reasoningActive ? `Reasoning: ${effortLabel(effort)}` : 'Reasoning effort'}
              onClick={() => setReasoningOpen((v) => !v)}
            >
              <ReasoningBulbIcon effort={effort} size={16} />
              {reasoningActive && (
                <span className="composer-tool-label">{effortLabel(effort)}</span>
              )}
            </button>
            <AnimatePresence>
              {reasoningOpen && (
                <ReasoningMenu
                  availableEfforts={availableEfforts}
                  defaultEffort={defaultEffort}
                  currentEffort={effort}
                  onSelect={(e) => void onSelectEffort(e)}
                  onClose={() => {
                    setReasoningOpen(false);
                    reasoningButtonRef.current?.focus();
                  }}
                  menuRef={reasoningMenuRef}
                />
              )}
            </AnimatePresence>
          </div>
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
