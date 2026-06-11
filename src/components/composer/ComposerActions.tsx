'use client';
import { useEffect, useRef, useState } from 'react';
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
import { useIsStudyTier } from '@/lib/auth/tierContext';
import { springs } from '@/lib/mobile/springConfig';
import type { Effort } from '@/components/composer/ComposerMobileMenu';

// ─────────────────────────────────────────────────────────────────────────────
// Reasoning effort — "Lightbulb, off to radiant"
// The physical icon morphs along the effort scale:
//   none  → Lucide LightbulbOff  (muted, thin)
//   low   → Lucide Lightbulb     (accent-soft, thin)
//   medium→ Lucide Lightbulb     (accent, bold)
//   high  → Heroicons solid bulb (accent)
//   xhigh → Heroicons solid bulb (accent, scaled)
// ─────────────────────────────────────────────────────────────────────────────

const EFFORT_LEVEL: Record<Effort, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  xhigh: 4,
};

const effortLabel = (e: Effort) =>
  e === 'none' ? 'Off' : e === 'xhigh' ? 'Extra High' : e.charAt(0).toUpperCase() + e.slice(1);

type BulbKind = 'off' | 'outline' | 'outline-bold' | 'solid' | 'solid-plus';

const EFFORT_KIND: Record<Effort, BulbKind> = {
  none: 'off',
  low: 'outline',
  medium: 'outline-bold',
  high: 'solid',
  xhigh: 'solid-plus',
};

function ReasoningBulbIcon({ effort, size = 16 }: { effort: Effort; size?: number }) {
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
  supportsXhigh?: boolean;
  currentEffort?: Effort;
  onSelect: (e: Effort) => void;
  onClose: () => void;
  menuRef: RefObject<HTMLDivElement>;
};

function ReasoningFan({
  supportsXhigh,
  currentEffort,
  onSelect,
  onClose,
  menuRef,
}: ReasoningFanProps) {
  const [hover, setHover] = useState<Effort | null>(null);
  const efforts: Effort[] = supportsXhigh
    ? ['none', 'low', 'medium', 'high', 'xhigh']
    : ['none', 'low', 'medium', 'high'];
  const { spread, radius, tickSizeStart, tickSizeEnd } = FAN;

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
        const clockDeg = -spread / 2 + spread * t;
        const rad = ((clockDeg - 90) * Math.PI) / 180;
        const level = EFFORT_LEVEL[e];
        const tickSize = tickSizeStart + (tickSizeEnd - tickSizeStart) * (level / 4);
        const tx = radius * Math.cos(rad);
        const ty = radius * Math.sin(rad);
        const iconSize = Math.max(14, Math.round(tickSize * 0.52));
        const current = currentEffort === e;
        return (
          <button
            key={e}
            type="button"
            role="radio"
            aria-checked={current}
            aria-label={effortLabel(e)}
            className="composer-reasoning-tick"
            data-current={current ? 'true' : 'false'}
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
            style={{ top: -(radius + tickSizeEnd + 12) }}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.12 }}
          >
            {effortLabel(hover)}
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
  searchProvider: 'tavily' | 'openrouter';
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
  attachmentsHint,
  searchEnabled,
  searchProvider,
  toggleSearch,
  showReasoningMenu,
  supportsXhigh,
  currentEffort,
  onSelectEffort,
  hasContent,
}: ComposerActionsProps) {
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const reasoningButtonRef = useRef<HTMLButtonElement | null>(null);
  const reasoningMenuRef = useRef<HTMLDivElement | null>(null);

  const isStudyTier = useIsStudyTier();

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

  const effort: Effort = currentEffort ?? 'none';
  const reasoningActive = effort !== 'none';

  const providerLabel = searchProvider === 'openrouter' ? 'OpenRouter' : 'Tavily';

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

      {!isStudyTier && (
        <button
          className={`composer-btn-search ${searchEnabled ? 'is-active' : ''}`}
          aria-pressed={searchEnabled}
          aria-label="Web search"
          title={
            searchEnabled
              ? `Web search: on (${providerLabel})`
              : `Web search: off (${providerLabel})`
          }
          onClick={toggleSearch}
        >
          <SearchGlobeIcon enabled={searchEnabled} size={16} />
        </button>
      )}

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
                supportsXhigh={supportsXhigh}
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
