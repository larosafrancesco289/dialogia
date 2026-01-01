# Dialogia Design System

> A comprehensive guide to the visual language and component patterns of Dialogia.
> Use alongside the `frontend-design` skill to build or refactor UI components.

---

## Design Philosophy: "Imperial Archive"

Dialogia's aesthetic evokes a **scholarly workspace** — the feeling of sitting at a writing desk with fresh parchment, warm lamplight, and carefully curated reference materials. This is not a trendy startup UI; it's a refined, editorial interface that prioritizes reading comfort and intellectual clarity.

### Core Principles

1. **Editorial over Trendy**: Solid paper surfaces, serif typography, manuscript-style annotations
2. **Warm & Welcoming**: Gold accents, warm shadows, brown undertones (even in dark mode)
3. **Authoritative Voice**: Different fonts distinguish assistant (serif) vs user (sans-serif)
4. **Minimal Interference**: Clean layouts, restrained color use, focus on content
5. **Tactile Depth**: Subtle shadows, layered surfaces, warm vignettes create reading-room atmosphere
6. **Smooth Motion**: Animations feel polished and deliberate, never jarring
7. **Accessible**: Touch-friendly sizes, focus rings, reduced-motion support

### What This Is NOT

- Glass morphism or frosted effects
- Neon/cyberpunk aesthetics
- Generic AI chat interfaces
- Purple gradient backgrounds
- Inter/Roboto/system font defaults

---

## Styling Policy

### Tailwind utilities vs tokenized CSS classes

- Use Tailwind utilities for layout, spacing, responsiveness, and one-off adjustments.
- Use tokenized global classes for recurring UI patterns (buttons, cards, badges, inputs).
- Promote styles into `styles/foundations.css` when a pattern appears in 3+ places or needs
  theme-token alignment.

### CSS modules vs global component CSS

- CSS modules are for component-scoped styling (`ComponentName.module.css`, camelCase classes).
- Global component classes live in `styles/components.css` (kebab-case names).
- Primitives belong in `styles/foundations.css`; tokens belong in `styles/tokens.css`.

### Style decision checklist

- [ ] Layout/spacing or one-off tweaks: Tailwind utilities.
- [ ] Component-specific or stateful visuals: CSS module.
- [ ] Repeated pattern (3+ uses) or tokenized rule: promote to `styles/components/*.css` or
      `styles/foundations.css`.

### Style file map

- `styles/tokens.css`: design tokens (colors, radii, spacing, shadows).
- `styles/foundations.css`: base resets + primitive patterns (buttons, inputs, cards, badges).
- `styles/layout.css`: global layout rules, app shell, and page atmosphere (vignette/grain).
- `styles/components/*.css`: feature-level styles by area (sidebar, settings, composer, message).
- `styles/components/utilities.css`: tokenized utility helpers shared across features.

---

## Typography

Typography is the soul of Dialogia's design. Different voices get different fonts.

### Font Stack

```css
/* UI / User messages — contemporary, clear */
--font-sans: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;

/* Assistant messages — scholarly, authoritative */
--font-serif-assistant: 'Newsreader', 'Source Serif 4', 'Literata', Georgia, serif;

/* General serif — body text, marginalia */
--font-serif: 'Charter', 'Bitstream Charter', 'Sitka Text', serif;

/* Code */
--font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;
```

### Typography Roles

| Context                | Font                     | Size             | Line Height | Letter Spacing |
| ---------------------- | ------------------------ | ---------------- | ----------- | -------------- |
| Assistant messages     | `--font-serif-assistant` | 1.25rem          | 1.72        | -0.006em       |
| User messages          | `--font-sans`            | 1.05rem          | 1.55        | 0.002em        |
| Headlines (h1)         | `--font-serif-assistant` | 1.65rem          | 1.3         | -0.015em       |
| Marginalia/annotations | `--font-sans`            | 0.9375rem (15px) | 1.65        | —              |
| Labels (uppercase)     | `--font-sans`            | 0.75rem          | —           | 0.05em         |

### Typography Guidelines

- **Assistant = Serif**: Creates authoritative, learned, trustworthy tone
- **User = Sans**: Modern, clear, direct
- Headlines use serif-assistant with weight 400-600
- Never use Inter, Roboto, or generic system fonts
- Markdown headings inherit `font-serif-assistant`

---

## Color Palette

### Light Mode ("Imperial Archive")

| Token              | Hex       | Usage                           |
| ------------------ | --------- | ------------------------------- |
| `--color-canvas`   | `#f4f1ec` | Page background (warm beige)    |
| `--color-surface`  | `#fdfbf8` | Cards, panels (cream paper)     |
| `--color-muted`    | `#f1ede7` | Subtle backgrounds              |
| `--color-fg`       | `#1e1c18` | Primary text (dark brown)       |
| `--color-fg-muted` | `#5b534b` | Secondary text                  |
| `--color-accent`   | `#b9975b` | Primary accent (warm gold)      |
| `--color-accent-2` | `#6d2a8a` | Secondary accent (purple)       |
| `--color-border`   | `#d5cfc4` | Borders (warm gray)             |
| `--color-success`  | `#4a8c5a` | Positive feedback (muted green) |
| `--color-danger`   | `#b35a4a` | Negative feedback (muted red)   |

### Dark Mode ("Candlelit Study")

| Token              | Hex       | Usage                         |
| ------------------ | --------- | ----------------------------- |
| `--color-canvas`   | `#0a0908` | Page background (near black)  |
| `--color-surface`  | `#14120f` | Cards (aged leather)          |
| `--color-muted`    | `#1c1814` | Subtle backgrounds            |
| `--color-fg`       | `#f4f1ec` | Primary text (light cream)    |
| `--color-fg-muted` | `#b8b0a4` | Secondary text                |
| `--color-accent`   | `#c9a227` | Primary accent (glowing gold) |
| `--color-accent-2` | `#8b5a9e` | Secondary accent              |
| `--color-border`   | `#2a2420` | Borders                       |
| `--color-success`  | `#7cb87a` | Positive feedback             |
| `--color-danger`   | `#d4645a` | Negative feedback             |

### Derived Colors

```css
/* Editorial surfaces */
--surface-paper: var(--color-surface);
--surface-paper-warm: color-mix(in oklab, var(--color-surface) 96%, var(--color-accent));
--marginalia-bg: color-mix(in oklab, var(--color-muted) 50%, transparent);

/* Ornamental rules */
--rule-light: color-mix(in oklab, var(--color-border) 50%, transparent);
--rule-accent: color-mix(in oklab, var(--color-accent) 40%, var(--color-border));

/* Feedback states */
--feedback-correct-bg: color-mix(in oklab, var(--color-success) 10%, var(--marginalia-bg));
--feedback-incorrect-bg: color-mix(in oklab, var(--color-danger) 10%, var(--marginalia-bg));
```

---

## Spacing & Sizing

### Spacing Scale (4px grid)

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-7: 28px;
--space-8: 32px;
```

### Control Sizes

```css
--control-sm: 32px;
--control-md: 40px;
--control-lg: 44px; /* Minimum tap target */
```

### Border Radius

```css
--radius-editorial: 6px; /* Print-like, refined */
--radius-editorial-mobile: 10px; /* Larger on mobile */
--radius-xs: 8px;
--radius-sm: 10px;
--radius-md: 12px;
--radius-lg: 14px;
--radius-xl: 18px;
```

---

## Shadows

Shadows in Dialogia have warm undertones, like cards resting on a wooden desk.

```css
/* Light mode */
--shadow-message:
  0 1px 2px rgba(120, 90, 50, 0.04), 0 4px 8px rgba(100, 80, 40, 0.03),
  0 8px 24px rgba(80, 60, 30, 0.04);

/* Dark mode — includes subtle gold tint */
--shadow-message:
  0 1px 3px rgba(20, 15, 10, 0.3), 0 4px 12px rgba(20, 15, 10, 0.25),
  0 8px 24px rgba(201, 162, 39, 0.05);

/* Standard elevation */
--shadow-1: 0 1px 2px rgba(0, 0, 0, 0.06);
--shadow-2: 0 8px 24px rgba(0, 0, 0, 0.08);
--shadow-3: 0 24px 48px rgba(0, 0, 0, 0.12);
```

---

## Motion & Animation

### Easing Functions

```css
--ease-standard: cubic-bezier(0.2, 0.8, 0.2, 1); /* Smooth default */
--ease-emphasized: cubic-bezier(0.2, 0.7, 0, 1); /* Snappier */
--ease-spring: cubic-bezier(0.175, 0.885, 0.32, 1.1); /* Weighted spring */
--spring-snappy: cubic-bezier(0.34, 1.56, 0.64, 1); /* Ultra springy */
```

### Durations

```css
--duration-fast: 140ms;
--duration-med: 200ms;
--duration-slow: 260ms;
```

### Key Animations

| Animation       | Usage                             | Duration | Easing              |
| --------------- | --------------------------------- | -------- | ------------------- |
| `fadeSlideUp`   | Page entrances, staggered reveals | 0.5-0.6s | `--ease-emphasized` |
| `drawRule`      | Decorative lines drawing in       | 0.8s     | `--ease-emphasized` |
| `answer-pop`    | MCQ selection feedback            | 140ms    | `--spring-snappy`   |
| `voice-pulse`   | Audio indicator                   | 1.5s     | ease-in-out         |
| `thinking-scan` | Shimmer on loading states         | 2.4s     | ease-in-out         |

### Animation Principles

1. **Stagger reveals**: Use `animation-delay` (0.1s, 0.25s, 0.35s) for sequential elements
2. **High-impact moments**: Focus on page load and state changes, not scattered micro-interactions
3. **Respect preferences**: Always include `@media (prefers-reduced-motion: reduce)` fallbacks
4. **Use Framer Motion** for React components with `AnimatePresence` for exit animations

---

## Component Patterns

### Marginalia (Annotation Boxes)

The signature Dialogia pattern — editorial annotations that feel like handwritten notes in a manuscript margin.

```css
.marginalia {
  background: var(--marginalia-bg);
  border: 1px solid var(--rule-light);
  border-left: 3px solid var(--rule-accent); /* Accent stripe */
  border-radius: var(--radius-editorial);
  padding: var(--space-4);
  font-size: 0.9375rem;
  line-height: 1.65;
}
```

**Usage**: Quiz cards, feedback panels, tutor content, sidebar annotations

### Editorial Surfaces (Not Glass)

Dialogia uses solid paper-like surfaces, not glassmorphism.

```css
.glass {
  background: var(--surface-paper); /* Solid, not translucent */
}

.glass-panel {
  background: var(--surface-paper);
}
```

### Message Cards

```css
/* Assistant: Full-width, transparent, serif */
.message-assistant {
  font-family: var(--font-serif-assistant);
  font-size: 1.25rem;
  line-height: 1.72;
}

/* User: Right-positioned box, warm tint, sans-serif */
.message-user {
  background: var(--surface-paper-warm);
  border: 1px solid var(--message-user-border);
  max-width: 85%;
  margin-left: auto;
  font-family: var(--font-sans);
  font-size: 1.05rem;
}
```

### Buttons

```css
/* Primary action — gold accent */
.btn-primary {
  background: var(--color-accent);
  color: #0b0b0b;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.5) inset,
    var(--shadow-1);
}

/* Outline — subtle border */
.btn-outline {
  background: transparent;
  border: 1px solid var(--color-border);
}

/* Ghost — minimal, hover reveals */
.btn-ghost {
  background: transparent;
  border: none;
}
.btn-ghost:hover {
  background: var(--color-muted);
}
```

### Feedback States

```css
/* Correct answer */
.feedback-correct {
  background: var(--feedback-correct-bg);
  border-color: var(--feedback-correct-border);
  color: var(--feedback-correct-text);
}

/* Incorrect answer */
.feedback-incorrect {
  background: var(--feedback-incorrect-bg);
  border-color: var(--feedback-incorrect-border);
  color: var(--feedback-incorrect-text);
}
```

---

## Background & Atmosphere

### Paper Grain Texture

Applied via SVG turbulence filter:

```css
body::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0.35;
  background-image: url('data:image/svg+xml,...feTurbulence...');
  mix-blend-mode: overlay;
}
```

### Warm Vignette

Darkens edges to create reading-room atmosphere:

```css
body::after {
  background: radial-gradient(
    ellipse 110% 90% at 50% 50%,
    transparent 40%,
    rgba(120, 95, 60, 0.08) 70%,
    rgba(80, 60, 40, 0.16) 100%
  );
}
```

---

## Responsive Breakpoints

| Breakpoint  | Behavior                                                     |
| ----------- | ------------------------------------------------------------ |
| `< 640px`   | Mobile: single column, sticky composer, larger touch targets |
| `>= 640px`  | Desktop: sidebar + content grid, asymmetric layouts          |
| `>= 1024px` | Large desktop: increased padding, wider max-widths           |

### Mobile Adaptations

- `--radius-editorial` increases to 10px
- Touch targets minimum 44px
- Sidebar hidden, revealed via swipe/button
- Composer fixed at bottom with keyboard offset handling

---

## Implementation Checklist

When building or refactoring a component:

- [ ] Use CSS variables from `styles/tokens.css`, never hardcode colors
- [ ] Apply `--font-serif-assistant` for assistant/editorial content
- [ ] Apply `--font-sans` for user-facing interactive elements
- [ ] Use `--radius-editorial` for print-like containers
- [ ] Add warm shadows (`--shadow-message`) for elevated surfaces
- [ ] Include `fadeSlideUp` entrance animation with staggered delays
- [ ] Use `marginalia` class for annotation-style content boxes
- [ ] Ensure 44px minimum touch targets on mobile
- [ ] Add `prefers-reduced-motion` fallbacks
- [ ] Test in both light and dark modes

---

## Quick Reference: CSS Variable Import

```tsx
// In your component's CSS module or global styles:
@import 'styles/tokens.css';

// Or use Tailwind utilities that reference the tokens:
className="bg-surface text-fg border-border"
```

---

## Example: Building a New Tutor Card

```tsx
// TutorCard.tsx
import { motion, AnimatePresence } from 'framer-motion';
import styles from './TutorCard.module.css';

export function TutorCard({ title, children }) {
  return (
    <motion.div
      className="marginalia"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.2, 0.7, 0, 1] }}
    >
      <div className={styles.header}>
        <span className={styles.label}>{title}</span>
      </div>
      <div className={styles.content}>{children}</div>
    </motion.div>
  );
}
```

```css
/* TutorCard.module.css */
.header {
  border-bottom: 1px solid var(--rule-light);
  padding-bottom: var(--space-2);
  margin-bottom: var(--space-3);
}

.label {
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-fg-muted);
}

.content {
  font-family: var(--font-serif-assistant);
  font-size: 1rem;
  line-height: 1.65;
}
```

---

_This document should be read alongside the `frontend-design` skill to maintain design consistency across all Dialogia UI work._
