import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
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
  // Mounted only while open, so Back puts it away.
  useBackToClose(true, onClose);

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
      className="popover popover--motion reasoning-scale absolute bottom-full left-0 z-30 mb-2"
      style={{ ['--stops' as string]: efforts.length, translate: `${shift}px 0` }}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={motionTransition.quick}
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

/** The composer's reasoning effort button and the scale it opens. */
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
  // The meter's four bars stand for this model's own levels above Off.
  const levels: ReasoningEffort[] = (availableEfforts ?? DEFAULT_EFFORTS).filter(
    (e) => e !== 'none',
  );
  const rank = levels.indexOf(effort) + 1;
  const filled = !reasoningActive ? 0 : rank > 0 ? Math.ceil((4 * rank) / levels.length) : 2;

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
        <EffortMeterIcon className="h-4 w-4" filled={filled} />
        {reasoningActive && <span className="composer-tool-label">{effortLabel(effort)}</span>}
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
  );
}
