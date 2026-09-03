import { useEffect, useRef, useState } from 'react';
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
// Reasoning effort — "Lightbulb, off to radiant"
// The physical icon morphs along the effort scale:
//   none  → Lucide LightbulbOff  (muted, thin)
//   low   → Lucide Lightbulb     (accent-soft, thin)
//   medium→ Lucide Lightbulb     (accent, bold)
//   high  → Heroicons solid bulb (accent)
//   xhigh → Heroicons solid bulb (accent, scaled)
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
      if (event.key === 'Escape') setOpen(false);
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
  e === 'none' ? 'Off' : e === 'xhigh' ? 'Extra High' : e.charAt(0).toUpperCase() + e.slice(1);

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
// 160° size-graded radial picker. Each tick renders the icon at its own effort
// level, so the fan itself reads as the progression.
// ─────────────────────────────────────────────────────────────────────────────

const FAN = {
  spread: 160,
  radius: 54,
  tickSizeStart: 28,
  tickSizeEnd: 44,
};

type ReasoningFanProps = {
  availableEfforts?: ReasoningEffort[];
  defaultEffort?: ReasoningEffort;
  currentEffort?: ReasoningEffort;
  onSelect: (e: ReasoningEffort) => void;
  onClose: () => void;
  menuRef: RefObject<HTMLDivElement>;
};

function ReasoningFan({
  availableEfforts,
  defaultEffort,
  currentEffort,
  onSelect,
  onClose,
  menuRef,
}: ReasoningFanProps) {
  const [hover, setHover] = useState<ReasoningEffort | null>(null);
  const efforts: ReasoningEffort[] = availableEfforts?.length ? availableEfforts : DEFAULT_EFFORTS;
  const { spread, radius, tickSizeStart, tickSizeEnd } = FAN;
  // Give crowded fans (6-7 levels) a little more arc and reach.
  const fanSpread = efforts.length > 5 ? 190 : spread;
  const fanRadius = efforts.length > 5 ? 66 : radius;

  return (
    <motion.div
      ref={menuRef}
      role="radiogroup"
      aria-label="Reasoning effort"
      className="composer-reasoning-fan"
      initial={{ opacity: 0, y: 4, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.96 }}
      transition={springs.snappy}
    >
      {efforts.map((e, i) => {
        const t = efforts.length > 1 ? i / (efforts.length - 1) : 0.5;
        const clockDeg = -fanSpread / 2 + fanSpread * t;
        const rad = ((clockDeg - 90) * Math.PI) / 180;
        const tickSize = tickSizeStart + (tickSizeEnd - tickSizeStart) * t;
        const tx = fanRadius * Math.cos(rad);
        const ty = fanRadius * Math.sin(rad);
        const iconSize = Math.max(14, Math.round(tickSize * 0.52));
        const current = currentEffort === e;
        const isDefault = defaultEffort === e;
        return (
          <button
            key={e}
            type="button"
            role="radio"
            aria-checked={current}
            aria-label={isDefault ? `${effortLabel(e)} (model default)` : effortLabel(e)}
            className="composer-reasoning-tick"
            data-current={current ? 'true' : 'false'}
            data-default={isDefault ? 'true' : 'false'}
            data-effort={e}
            style={{
              width: tickSize,
              height: tickSize,
              margin: `-${tickSize / 2}px`,
              transform: `translate(${tx}px, ${ty}px)`,
            }}
            onMouseEnter={() => setHover(e)}
            onMouseLeave={() => setHover((v) => (v === e ? null : v))}
            onFocus={() => setHover(e)}
            onBlur={() => setHover((v) => (v === e ? null : v))}
            onClick={() => {
              onSelect(e);
              onClose();
            }}
          >
            <ReasoningBulbIcon effort={e} size={iconSize} />
          </button>
        );
      })}
      <AnimatePresence>
        {hover !== null && (
          <motion.span
            key={hover}
            className="composer-reasoning-caption"
            style={{ top: -(fanRadius + tickSizeEnd + 12) }}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.12 }}
          >
            {effortLabel(hover)}
            {hover === defaultEffort ? ' · default' : ''}
          </motion.span>
        )}
      </AnimatePresence>
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

  const effort: ReasoningEffort = currentEffort ?? 'none';
  const reasoningActive = effort !== 'none';

  const providerLabel = searchModeLabel(searchProvider);
  // With only provider-native search available there is nothing to choose
  // between, so the button stays a plain on/off toggle.
  const searchModes = listSearchModeOptions();
  const hasSearchChoice = searchModes.length > 1;

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        className="composer-btn-attach"
        aria-label="Attach files"
        title={attachmentsHint || 'Attach files'}
        onClick={openFilePicker}
      >
        <PaperClipIcon className="h-4 w-4" />
      </button>

      <div className="relative">
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
        </button>
        <AnimatePresence>
          {hasSearchChoice && searchMenuOpen && (
            <motion.div
              ref={searchMenuRef}
              role="menu"
              aria-label="Web search"
              className="popover card absolute bottom-full right-0 z-30 mb-2 w-56 p-1"
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

      {showReasoningMenu && (
        <div className="relative">
          <button
            ref={reasoningButtonRef}
            className={`composer-btn-reasoning ${reasoningActive ? 'is-active' : ''} ${reasoningOpen ? 'is-open' : ''}`}
            data-effort={effort}
            aria-haspopup="listbox"
            aria-expanded={reasoningOpen}
            aria-label="Reasoning effort"
            title={reasoningActive ? `Reasoning: ${effortLabel(effort)}` : 'Reasoning effort'}
            onClick={() => setReasoningOpen((v) => !v)}
          >
            <ReasoningBulbIcon effort={effort} size={16} />
          </button>
          <AnimatePresence>
            {reasoningOpen && (
              <ReasoningFan
                availableEfforts={availableEfforts}
                defaultEffort={defaultEffort}
                currentEffort={effort}
                onSelect={(e) => void onSelectEffort(e)}
                onClose={() => setReasoningOpen(false)}
                menuRef={reasoningMenuRef}
              />
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
