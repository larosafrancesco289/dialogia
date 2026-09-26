import { Fragment, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { motionTransition } from '@/lib/ui/motion';
import type { ReasoningEffort } from '@/lib/types';
import { useBackToClose } from '@/lib/hooks/useBackToClose';
import { useDismissOnOutside } from '@/lib/hooks/useDismissOnOutside';
import { EffortMeterIcon } from '@/components/ui/icons';

const effortLabel = (e: ReasoningEffort) =>
  e === 'none' ? 'Off' : e === 'xhigh' ? 'Extra high' : e.charAt(0).toUpperCase() + e.slice(1);

const DEFAULT_EFFORTS: ReasoningEffort[] = ['none', 'low', 'medium', 'high'];

// ─────────────────────────────────────────────────────────────────────────────
// Reasoning effort: a quiet list rising from the button, the most thought at
// the head and Off (when the model allows it) at the foot. Only the levels
// this model offers are listed, Off set apart by a hairline. The chosen row
// takes the tick every menu uses and the model's default is a quiet word.
// One italic line at the head says what the pointed-at level does. Arrow keys
// walk the list.
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

/** How far up this model's levels an effort sits: 0 for Off, n for the top. */
function effortRank(levels: ReasoningEffort[], effort: ReasoningEffort): number {
  return levels.indexOf(effort) + 1;
}

type ReasoningMenuProps = {
  efforts: ReasoningEffort[];
  defaultEffort?: ReasoningEffort;
  currentEffort?: ReasoningEffort;
  onSelect: (e: ReasoningEffort) => void;
  onClose: () => void;
  menuRef: RefObject<HTMLDivElement>;
};

function ReasoningMenu({
  efforts,
  defaultEffort,
  currentEffort,
  onSelect,
  onClose,
  menuRef,
}: ReasoningMenuProps) {
  const currentIndex = Math.max(0, efforts.indexOf(currentEffort ?? 'none'));
  const [focusIndex, setFocusIndex] = useState(currentIndex);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [shift, setShift] = useState(0);
  const shown = efforts[previewIndex ?? currentIndex];
  const rowsRef = useRef<Array<HTMLButtonElement | null>>([]);
  // Mounted only while open, so Back puts it away.
  useBackToClose(true, onClose);

  useEffect(() => {
    rowsRef.current[currentIndex]?.focus();
  }, [currentIndex]);

  // Keep the list on screen: the button may sit anywhere along the row.
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
    rowsRef.current[next]?.focus();
  };

  // Drawn top-down, so the list runs from the most thought to none.
  const rows = efforts.map((e, index) => ({ e, index })).reverse();

  return (
    <motion.div
      ref={menuRef}
      role="radiogroup"
      aria-label="Reasoning effort"
      className="popover popover--motion effort-menu absolute bottom-full left-0 z-30 mb-2"
      style={{ translate: `${shift}px 0` }}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={motionTransition.quick}
      onKeyDown={(event) => {
        // Read the position from focus, not state, so quick presses add up.
        const at = rowsRef.current.indexOf(document.activeElement as HTMLButtonElement);
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
      <p className="effort-menu__hint" aria-live="polite">
        {EFFORT_HINT[shown]}
      </p>
      {rows.map(({ e, index }) => (
        <Fragment key={e}>
          {/* Off is not a level of thought but none: a hairline sets it apart. */}
          {e === 'none' && efforts.length > 1 && (
            <span className="effort-menu__rule" aria-hidden="true" />
          )}
          <button
            ref={(node) => {
              rowsRef.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={index === currentIndex}
            tabIndex={index === focusIndex ? 0 : -1}
            className="effort-menu__row"
            aria-label={defaultEffort === e ? `${effortLabel(e)} (model default)` : effortLabel(e)}
            onMouseEnter={() => setPreviewIndex(index)}
            onFocus={() => setPreviewIndex(index)}
            onClick={() => {
              onSelect(e);
              onClose();
            }}
          >
            <span>{effortLabel(e)}</span>
            {defaultEffort === e && <span className="effort-menu__default">default</span>}
          </button>
        </Fragment>
      ))}
    </motion.div>
  );
}

/** The composer's reasoning effort button and the list it opens. */
export function ReasoningEffortControl({
  availableEfforts,
  defaultEffort,
  currentEffort,
  onSelectEffort,
}: {
  availableEfforts?: ReasoningEffort[];
  defaultEffort?: ReasoningEffort;
  currentEffort?: ReasoningEffort;
  onSelectEffort: (effort: ReasoningEffort) => Promise<void> | void;
}) {
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const reasoningButtonRef = useRef<HTMLButtonElement | null>(null);
  const reasoningMenuRef = useRef<HTMLDivElement | null>(null);

  useDismissOnOutside({
    open: reasoningOpen,
    insideRefs: [reasoningMenuRef, reasoningButtonRef],
    onOutsidePress: () => setReasoningOpen(false),
    onEscape: () => {
      setReasoningOpen(false);
      // Focus goes back to the button that opened it, not to the page.
      reasoningButtonRef.current?.focus();
    },
  });

  const effort: ReasoningEffort = currentEffort ?? 'none';
  const reasoningActive = effort !== 'none';
  const efforts: ReasoningEffort[] = availableEfforts?.length ? availableEfforts : DEFAULT_EFFORTS;
  // The meter has one bar per level this model offers above Off.
  const levels = efforts.filter((e) => e !== 'none');

  return (
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
        {/* A level meter filled to the effort; the word beside it names it. */}
        <EffortMeterIcon
          className="h-4 w-4"
          levels={levels.length}
          filled={effortRank(levels, effort)}
        />
        {reasoningActive && <span className="composer-tool-label">{effortLabel(effort)}</span>}
      </button>
      <AnimatePresence>
        {reasoningOpen && (
          <ReasoningMenu
            efforts={efforts}
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
  );
}
