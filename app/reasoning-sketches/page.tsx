'use client';

/**
 * Sandbox page for reasoning-effort design.
 * Round 4: the icon itself changes with effort — either through a bold ramp
 * on a single icon, or through a deliberate swap sequence along a metaphor
 * family (bulb / brain / sparkles). The committed control surface is the
 * 160° size-graded radial picker, whose ticks render the recipe at each
 * tick's level so the fan visually progresses too.
 *
 * Route: /reasoning-sketches
 */

import type { ComponentType } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LightBulbIcon as HeroLightBulbOutline,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline';
import { LightBulbIcon as HeroLightBulbSolid } from '@heroicons/react/24/solid';
import {
  Brain,
  BrainCircuit,
  BrainCog,
  Lightbulb as LucideLightbulb,
  LightbulbOff as LucideLightbulbOff,
  Sparkle as LucideSparkle,
  Sparkles as LucideSparkles,
  WandSparkles as LucideWandSparkles,
} from 'lucide-react';

type Level = 0 | 1 | 2 | 3 | 4;
const LEVELS: Level[] = [0, 1, 2, 3, 4];
const LEVEL_NAMES: Record<Level, string> = {
  0: 'Off',
  1: 'Low',
  2: 'Medium',
  3: 'High',
  4: 'Extra high',
};

const SPRING_SNAPPY = { type: 'spring' as const, stiffness: 320, damping: 28, mass: 1 };
const SPRING_SMOOTH = { type: 'spring' as const, stiffness: 260, damping: 30, mass: 1 };

// ─────────────────────────────────────────────────────────────────────────────
// Recipe types
// ─────────────────────────────────────────────────────────────────────────────

// Icons come from different sets with different prop shapes. Keep the shared
// type loose so we can store them side by side.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IconComponent = ComponentType<any>;

type LevelStyle = {
  Icon: IconComponent;
  /** CSS color for the icon. */
  color: string;
  /** Lucide/Heroicons stroke-width. Ignored by solid Heroicons. */
  strokeWidth?: number;
  /** Visual scale relative to the base size. */
  scale?: number;
};

type Recipe = {
  id: string;
  name: string;
  description: string;
  levels: Record<Level, LevelStyle>;
};

const MUTED = 'var(--color-fg-muted)';
const ACCENT = 'var(--color-accent)';
const ACCENT_SOFT = 'color-mix(in oklab, var(--color-fg-muted) 45%, var(--color-accent))';
const ACCENT_MED = 'color-mix(in oklab, var(--color-fg-muted) 20%, var(--color-accent))';

// ─────────────────────────────────────────────────────────────────────────────
// Recipes
// ─────────────────────────────────────────────────────────────────────────────

const RECIPES: Recipe[] = [
  {
    id: 'bulb-family',
    name: 'Lightbulb \u2014 off to radiant',
    description:
      'Lucide LightbulbOff \u2192 Lightbulb (thin) \u2192 Lightbulb (bold) \u2192 Heroicons solid \u2192 Heroicons solid, scaled. The icon literally lights up and grows warmer.',
    levels: {
      0: { Icon: LucideLightbulbOff, color: MUTED, strokeWidth: 1.5 },
      1: { Icon: LucideLightbulb, color: ACCENT_SOFT, strokeWidth: 1.5 },
      2: { Icon: LucideLightbulb, color: ACCENT, strokeWidth: 2 },
      3: { Icon: HeroLightBulbSolid, color: ACCENT },
      4: { Icon: HeroLightBulbSolid, color: ACCENT, scale: 1.12 },
    },
  },
  {
    id: 'brain-family',
    name: 'Brain \u2014 thinking escalation',
    description:
      'Brain \u2192 Brain (bold) \u2192 BrainCog \u2192 BrainCircuit \u2192 BrainCircuit (bold, scaled). The metaphor visibly escalates: thinking \u2192 processing \u2192 fully engaged.',
    levels: {
      0: { Icon: Brain, color: MUTED, strokeWidth: 1.5 },
      1: { Icon: Brain, color: ACCENT, strokeWidth: 1.85 },
      2: { Icon: BrainCog, color: ACCENT, strokeWidth: 1.85 },
      3: { Icon: BrainCircuit, color: ACCENT, strokeWidth: 1.85 },
      4: { Icon: BrainCircuit, color: ACCENT, strokeWidth: 2.4, scale: 1.08 },
    },
  },
  {
    id: 'brain-circuit-ramp',
    name: 'Brain circuit \u2014 weight ramp',
    description:
      'Same BrainCircuit every level. Only stroke-width and color change. The icon physically thickens and deepens from hair-line muted to bold accent.',
    levels: {
      0: { Icon: BrainCircuit, color: MUTED, strokeWidth: 1.15 },
      1: { Icon: BrainCircuit, color: ACCENT_SOFT, strokeWidth: 1.45 },
      2: { Icon: BrainCircuit, color: ACCENT_MED, strokeWidth: 1.85 },
      3: { Icon: BrainCircuit, color: ACCENT, strokeWidth: 2.35 },
      4: { Icon: BrainCircuit, color: ACCENT, strokeWidth: 2.85, scale: 1.06 },
    },
  },
  {
    id: 'hero-bulb-swap',
    name: 'Heroicons bulb \u2014 outline to solid',
    description:
      'Heroicons outline at 0\u20132, Heroicons solid at 3\u20134. Uses only the project\u2019s existing icon set. Simplest family.',
    levels: {
      0: { Icon: HeroLightBulbOutline, color: MUTED },
      1: { Icon: HeroLightBulbOutline, color: ACCENT_SOFT },
      2: { Icon: HeroLightBulbOutline, color: ACCENT },
      3: { Icon: HeroLightBulbSolid, color: ACCENT },
      4: { Icon: HeroLightBulbSolid, color: ACCENT, scale: 1.15 },
    },
  },
  {
    id: 'sparkles-family',
    name: 'Sparkles \u2014 one to many',
    description:
      'Sparkle (one) \u2192 Sparkles \u2192 Sparkles (bold) \u2192 WandSparkles \u2192 WandSparkles (bold, scaled). The glint population grows.',
    levels: {
      0: { Icon: LucideSparkle, color: MUTED, strokeWidth: 1.4 },
      1: { Icon: LucideSparkle, color: ACCENT, strokeWidth: 1.75 },
      2: { Icon: LucideSparkles, color: ACCENT, strokeWidth: 1.85 },
      3: { Icon: LucideWandSparkles, color: ACCENT, strokeWidth: 1.85 },
      4: { Icon: LucideWandSparkles, color: ACCENT, strokeWidth: 2.4, scale: 1.1 },
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Recipe renderer
// ─────────────────────────────────────────────────────────────────────────────

function RecipeIcon({
  recipe,
  level,
  size = 16,
  animate = true,
}: {
  recipe: Recipe;
  level: Level;
  size?: number;
  animate?: boolean;
}) {
  const style = recipe.levels[level];
  const Icon = style.Icon;
  const scale = style.scale ?? 1;

  const body = (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: style.color,
        transform: scale === 1 ? undefined : `scale(${scale})`,
        transformOrigin: 'center',
        transition: animate
          ? 'color 240ms cubic-bezier(0.2, 0.8, 0.2, 1), transform 240ms cubic-bezier(0.34, 1.56, 0.64, 1)'
          : undefined,
        width: size,
        height: size,
      }}
    >
      <Icon size={size} strokeWidth={style.strokeWidth} />
    </span>
  );

  if (!animate) return body;

  // Crossfade when the concrete icon component changes (family stories).
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={`${recipe.id}:${level}:${Icon.displayName ?? 'icon'}`}
        initial={{ opacity: 0, scale: 0.82 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.82 }}
        transition={{ duration: 0.14 }}
        style={{ display: 'inline-flex' }}
      >
        {body}
      </motion.span>
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Composer button
// ─────────────────────────────────────────────────────────────────────────────

function RecipeButton({
  recipe,
  level,
  onClick,
  isOpen = false,
  title,
  withHalo = false,
}: {
  recipe: Recipe;
  level: Level;
  onClick?: () => void;
  isOpen?: boolean;
  title?: string;
  withHalo?: boolean;
}) {
  const active = level > 0;
  const halo =
    !withHalo || level === 0
      ? 'none'
      : level === 1
        ? '0 0 0 2px color-mix(in oklab, var(--color-accent) 10%, transparent)'
        : level === 2
          ? '0 0 0 3px color-mix(in oklab, var(--color-accent) 14%, transparent)'
          : level === 3
            ? '0 0 0 4px color-mix(in oklab, var(--color-accent) 20%, transparent)'
            : '0 0 0 5px color-mix(in oklab, var(--color-accent) 26%, transparent)';

  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? `Reasoning: ${LEVEL_NAMES[level]}`}
      aria-label={title ?? `Reasoning: ${LEVEL_NAMES[level]}`}
      className="sk-btn"
      data-active={active ? 'true' : 'false'}
      data-open={isOpen ? 'true' : 'false'}
      style={{ boxShadow: halo }}
    >
      <RecipeIcon recipe={recipe} level={level} />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 160° graded radial picker — each tick renders the recipe at its own level
// ─────────────────────────────────────────────────────────────────────────────

const PICKER = {
  spread: 160,
  radius: 54,
  tickSizeStart: 26,
  tickSizeEnd: 42,
};

function RadialGradedPicker({
  recipe,
  level,
  setLevel,
}: {
  recipe: Recipe;
  level: Level;
  setLevel: (l: Level) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<Level | null>(null);
  const displayLevel = hover ?? level;
  const { spread, radius, tickSizeStart, tickSizeEnd } = PICKER;

  return (
    <div className="sk-picker-root">
      <AnimatePresence>
        {open && (
          <motion.div
            className="sk-picker-fan"
            role="radiogroup"
            aria-label="Reasoning effort"
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={SPRING_SNAPPY}
          >
            {LEVELS.map((l, i) => {
              const t = LEVELS.length > 1 ? i / (LEVELS.length - 1) : 0.5;
              const clockDeg = -spread / 2 + spread * t;
              const rad = ((clockDeg - 90) * Math.PI) / 180;
              const tx = radius * Math.cos(rad);
              const ty = radius * Math.sin(rad);
              const tickSize = tickSizeStart + (tickSizeEnd - tickSizeStart) * (l / 4);
              const iconSize = Math.max(12, Math.round(tickSize * 0.52));
              const current = l === level;
              return (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={current}
                  aria-label={LEVEL_NAMES[l]}
                  className="sk-picker-tick"
                  data-current={current ? 'true' : 'false'}
                  style={{
                    width: tickSize,
                    height: tickSize,
                    margin: `-${tickSize / 2}px`,
                    transform: `translate(${tx}px, ${ty}px)`,
                  }}
                  onMouseEnter={() => setHover(l)}
                  onFocus={() => setHover(l)}
                  onClick={() => {
                    setLevel(l);
                    setOpen(false);
                    setHover(null);
                  }}
                >
                  <RecipeIcon recipe={recipe} level={l} size={iconSize} animate={false} />
                </button>
              );
            })}
            <AnimatePresence>
              {hover !== null && (
                <motion.span
                  key={hover}
                  className="sk-picker-caption"
                  style={{ top: -(radius + tickSizeEnd + 12) }}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.12 }}
                >
                  {LEVEL_NAMES[hover]}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <RecipeButton
        recipe={recipe}
        level={displayLevel}
        isOpen={open}
        onClick={() => setOpen((v) => !v)}
        title={`Reasoning: ${LEVEL_NAMES[level]}`}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Theme toggle
// ─────────────────────────────────────────────────────────────────────────────

function useThemeToggle() {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);
  const toggle = () => {
    const root = document.documentElement;
    const next = !root.classList.contains('dark');
    root.classList.toggle('dark', next);
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light');
    } catch {}
    setIsDark(next);
  };
  return { isDark, toggle };
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ReasoningSketchesPage() {
  const { isDark, toggle } = useThemeToggle();

  const [recipeId, setRecipeId] = useState<string>('brain-family');
  const recipe = useMemo(() => RECIPES.find((r) => r.id === recipeId) ?? RECIPES[0], [recipeId]);

  const [demoLevel, setDemoLevel] = useState<Level>(2);
  const [mainLevel, setMainLevel] = useState<Level>(2);

  return (
    <div className="sk-page">
      <style jsx global>{`
        .sk-page {
          min-height: 100vh;
          background: var(--color-canvas);
          color: var(--color-fg);
          padding: 48px 32px 120px;
          font-family: var(--font-sans);
        }
        .sk-container {
          max-width: 1120px;
          margin: 0 auto;
        }
        .sk-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 24px;
          margin-bottom: 40px;
          padding-bottom: 20px;
          border-bottom: 1px solid var(--rule-light);
        }
        .sk-eyebrow {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--color-fg-muted);
        }
        .sk-title {
          font-family: var(--font-serif-assistant);
          font-size: 32px;
          line-height: 1.1;
          margin: 8px 0 6px;
          letter-spacing: -0.01em;
        }
        .sk-subtitle {
          font-size: 14px;
          color: var(--color-fg-muted);
          max-width: 64ch;
        }
        .sk-theme-btn {
          font-size: 12px;
          padding: 8px 12px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-editorial);
          background: var(--surface-paper);
          color: var(--color-fg);
          cursor: pointer;
        }
        .sk-theme-btn:hover {
          background: var(--color-muted);
        }

        .sk-section {
          margin-top: 56px;
        }
        .sk-section__head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 24px;
          margin-bottom: 16px;
        }
        .sk-section__title {
          font-family: var(--font-serif-assistant);
          font-size: 20px;
          letter-spacing: -0.005em;
        }
        .sk-section__desc {
          font-size: 13px;
          color: var(--color-fg-muted);
          max-width: 64ch;
        }
        .sk-section__kicker {
          font-size: 11px;
          color: var(--color-fg-muted);
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }

        /* Recipes */
        .sk-recipes {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }
        .sk-recipe {
          display: grid;
          grid-template-columns: 280px 1fr;
          gap: 24px;
          padding: 18px 18px 18px 20px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-editorial);
          background: var(--surface-paper);
          cursor: pointer;
          text-align: left;
          color: inherit;
          transition:
            border-color 160ms,
            background 160ms,
            box-shadow 200ms;
        }
        .sk-recipe:hover {
          background: var(--surface-inset);
        }
        .sk-recipe[data-selected='true'] {
          border-color: color-mix(in oklab, var(--color-accent) 55%, var(--color-border));
          box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-accent) 12%, transparent);
        }
        .sk-recipe__meta {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .sk-recipe__name {
          font-family: var(--font-serif-assistant);
          font-size: 16px;
          font-weight: 500;
          letter-spacing: -0.005em;
        }
        .sk-recipe__desc {
          font-size: 12.5px;
          color: var(--color-fg-muted);
          line-height: 1.5;
        }
        .sk-recipe__levels {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 10px;
        }
        .sk-recipe__cell {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 10px 6px 8px;
          border-radius: var(--radius-editorial);
          background: var(--surface-inset);
        }
        .sk-recipe__sizes {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }
        .sk-recipe__label {
          font-size: 11px;
          color: var(--color-fg-muted);
          letter-spacing: 0.04em;
        }

        /* Composer button */
        .sk-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          padding: 0;
          border: none;
          border-radius: var(--radius-editorial);
          background: transparent;
          cursor: pointer;
          transition:
            background 160ms cubic-bezier(0.2, 0.8, 0.2, 1),
            transform 120ms cubic-bezier(0.2, 0.8, 0.2, 1);
          position: relative;
        }
        .sk-btn:hover {
          background: var(--color-muted);
        }
        .sk-btn:active {
          transform: scale(0.94);
        }
        .sk-btn[data-active='true']:not([data-open='true']):not(:hover) {
          background: color-mix(in oklab, var(--color-accent) 12%, transparent);
        }
        .sk-btn[data-open='true'] {
          background: var(--color-muted);
        }
        .sk-btn:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px var(--focus-ring);
        }

        /* Picker */
        .sk-picker-root {
          position: relative;
          display: inline-flex;
          align-items: center;
          overflow: visible;
        }
        .sk-picker-fan {
          position: absolute;
          left: 50%;
          bottom: 50%;
          width: 0;
          height: 0;
          pointer-events: none;
          z-index: 20;
        }
        .sk-picker-tick {
          position: absolute;
          left: 0;
          top: 0;
          padding: 0;
          border: 1px solid var(--color-border);
          border-radius: 999px;
          background: var(--surface-paper);
          color: var(--color-fg-muted);
          cursor: pointer;
          pointer-events: auto;
          box-shadow: var(--shadow-1);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition:
            background 120ms,
            box-shadow 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .sk-picker-tick:hover,
        .sk-picker-tick:focus-visible {
          background: var(--color-muted);
          outline: none;
        }
        .sk-picker-tick[data-current='true'] {
          background: color-mix(in oklab, var(--color-accent) 18%, var(--surface-paper));
          border-color: color-mix(in oklab, var(--color-accent) 45%, var(--color-border));
          box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-accent) 15%, transparent);
        }
        .sk-picker-caption {
          position: absolute;
          left: 0;
          transform: translateX(-50%);
          padding: 4px 10px;
          border-radius: 999px;
          background: var(--color-fg);
          color: var(--color-canvas);
          font-size: 11px;
          white-space: nowrap;
          pointer-events: none;
        }

        /* Composer mock */
        .sk-composer {
          display: flex;
          align-items: flex-end;
          gap: 8px;
          padding: 12px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-editorial);
          background: var(--surface-paper);
          margin-top: 140px;
          position: relative;
        }
        .sk-composer__field {
          flex: 1;
          min-height: 72px;
          padding: 10px 12px;
          border-radius: var(--radius-editorial);
          background: var(--surface-inset);
          color: var(--color-fg-muted);
          font-size: 13px;
          font-style: italic;
          display: flex;
          align-items: center;
        }
        .sk-composer__actions {
          display: flex;
          align-items: center;
          gap: 6px;
          padding-bottom: 2px;
        }
        .sk-send {
          width: 36px;
          height: 36px;
          border: none;
          border-radius: var(--radius-editorial);
          background: var(--color-fg);
          color: var(--color-canvas);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: default;
        }

        /* Readout / level scrubber */
        .sk-readout {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 12px;
          font-size: 12px;
          color: var(--color-fg-muted);
          flex-wrap: wrap;
        }
        .sk-readout strong {
          color: var(--color-fg);
          font-weight: 500;
        }
        .sk-scrub {
          display: inline-flex;
          gap: 6px;
        }
        .sk-scrub button {
          padding: 4px 10px;
          font-size: 11px;
          border-radius: 999px;
          border: 1px solid var(--color-border);
          background: transparent;
          color: var(--color-fg-muted);
          cursor: pointer;
        }
        .sk-scrub button[aria-pressed='true'] {
          background: color-mix(in oklab, var(--color-accent) 16%, transparent);
          color: var(--color-accent);
        }

        /* Single strip */
        .sk-strip {
          display: flex;
          align-items: center;
          gap: 18px;
          padding: 14px 16px;
          border-radius: var(--radius-editorial);
          background: var(--surface-paper);
          border: 1px solid var(--color-border);
        }
        .sk-strip__label {
          min-width: 200px;
          font-size: 12.5px;
        }
        .sk-strip__label small {
          display: block;
          font-size: 10.5px;
          color: var(--color-fg-muted);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-top: 2px;
        }
        .sk-strip__levels {
          display: flex;
          align-items: center;
          gap: 14px;
        }
      `}</style>

      <div className="sk-container">
        <header className="sk-header">
          <div>
            <div className="sk-eyebrow">Sandbox &middot; Round 4</div>
            <h1 className="sk-title">Reasoning effort &mdash; the icon itself morphs</h1>
            <p className="sk-subtitle">
              Each recipe changes the physical icon with the effort level &mdash; either by swapping
              across a metaphor family, or by dialling up stroke weight, color, and scale on a
              single glyph. The 160&deg; graded picker below shows the same recipe across its ticks
              so the fan <em>is</em> the progression.
            </p>
          </div>
          <button type="button" className="sk-theme-btn" onClick={toggle} aria-label="Toggle theme">
            {isDark ? 'Light theme' : 'Dark theme'}
          </button>
        </header>

        {/* ────────── Section 1 ────────── */}
        <section className="sk-section">
          <div className="sk-section__head">
            <div>
              <div className="sk-section__kicker">Step 1</div>
              <h2 className="sk-section__title">Pick a recipe</h2>
            </div>
            <p className="sk-section__desc">
              Each recipe is a complete mapping from effort level to an icon rendering. Click to
              select; the committed picker below updates immediately.
            </p>
          </div>

          <div className="sk-recipes">
            {RECIPES.map((r) => {
              const selected = r.id === recipeId;
              return (
                <button
                  key={r.id}
                  type="button"
                  className="sk-recipe"
                  data-selected={selected ? 'true' : 'false'}
                  aria-pressed={selected}
                  onClick={() => setRecipeId(r.id)}
                >
                  <div className="sk-recipe__meta">
                    <div className="sk-recipe__name">{r.name}</div>
                    <div className="sk-recipe__desc">{r.description}</div>
                  </div>
                  <div className="sk-recipe__levels">
                    {LEVELS.map((l) => (
                      <div key={l} className="sk-recipe__cell">
                        <div className="sk-recipe__sizes">
                          <RecipeIcon recipe={r} level={l} size={16} animate={false} />
                          <RecipeIcon recipe={r} level={l} size={24} animate={false} />
                          <RecipeIcon recipe={r} level={l} size={40} animate={false} />
                        </div>
                        <div className="sk-recipe__label">{LEVEL_NAMES[l]}</div>
                      </div>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ────────── Section 2 ────────── */}
        <section className="sk-section">
          <div className="sk-section__head">
            <div>
              <div className="sk-section__kicker">Step 2 &mdash; committed control</div>
              <h2 className="sk-section__title">{recipe.name} &middot; 160&deg; graded picker</h2>
            </div>
            <p className="sk-section__desc">
              Click the composer button to open the picker. Each tick renders the same recipe at its
              own level &mdash; so the fan itself tells the story of the scale.
            </p>
          </div>

          <div className="sk-composer">
            <div className="sk-composer__field">Ask anything&hellip;</div>
            <div className="sk-composer__actions">
              <RadialGradedPicker recipe={recipe} level={mainLevel} setLevel={setMainLevel} />
              <button className="sk-send" aria-label="Send" tabIndex={-1}>
                <PaperAirplaneIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="sk-readout">
            <span>
              Committed level: <strong>{LEVEL_NAMES[mainLevel]}</strong>
            </span>
            <span style={{ marginLeft: 'auto' }}>
              Button at rest, any level:&nbsp;
              <RecipeButton recipe={recipe} level={demoLevel} />
            </span>
            <span className="sk-scrub">
              {LEVELS.map((l) => (
                <button
                  key={l}
                  type="button"
                  aria-pressed={demoLevel === l}
                  onClick={() => setDemoLevel(l)}
                >
                  {LEVEL_NAMES[l]}
                </button>
              ))}
            </span>
          </div>
        </section>

        {/* ────────── Section 3 — reference grid ────────── */}
        <section className="sk-section">
          <div className="sk-section__head">
            <div>
              <div className="sk-section__kicker">Reference</div>
              <h2 className="sk-section__title">All recipes, all levels</h2>
            </div>
            <p className="sk-section__desc">
              Side-by-side so you can compare how each recipe scales the signal across effort.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {RECIPES.map((r) => (
              <div key={r.id} className="sk-strip">
                <div className="sk-strip__label">
                  <strong>{r.name}</strong>
                  <small>{r.id}</small>
                </div>
                <div className="sk-strip__levels">
                  {LEVELS.map((l) => (
                    <div
                      key={l}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <RecipeButton recipe={r} level={l} />
                      <span
                        style={{
                          fontSize: 10.5,
                          color: 'var(--color-fg-muted)',
                          letterSpacing: '0.04em',
                        }}
                      >
                        {LEVEL_NAMES[l]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ────────── Notes ────────── */}
        <section className="sk-section">
          <div className="sk-section__head">
            <h2 className="sk-section__title">Notes</h2>
          </div>
          <ul
            style={{
              fontSize: 13,
              color: 'var(--color-fg-muted)',
              lineHeight: 1.7,
              paddingLeft: 18,
            }}
          >
            <li>
              Every recipe has its own level-0 treatment so the rest state reads clearly as the
              metaphor &mdash; e.g. the bulb recipe shows <code>LightbulbOff</code> at Off so the
              meaning is unmissable.
            </li>
            <li>
              Family-story recipes swap icons at certain levels and crossfade between them; bold
              ramps keep the same icon and tween stroke + color.
            </li>
            <li>
              Picker ticks render <em>their own level</em> of the recipe at a size proportional to
              the tick. That makes the fan double as a legend for the scale.
            </li>
            <li>
              When you&rsquo;ve picked a recipe, tell me the ID and I&rsquo;ll wire it into the real
              composer (replace <code>ReasoningEffortControl</code> + <code>PondGlyph</code>, update{' '}
              <code>composer-btn-reasoning</code>).
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
