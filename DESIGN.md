---
name: Dialogia
description: AI that makes you better: a local-first tutoring and multi-model chat workspace.
colors:
  canvas-parchment: "#f4f1ec"
  surface-paper: "#fdfbf8"
  muted-vellum: "#f1ede7"
  ink-brown: "#1e1c18"
  marginalia-brown: "#5b534b"
  tutor-gold: "#b9975b"
  scholar-plum: "#6d2a8a"
  warm-rule: "#d5cfc4"
  success-sage: "#4a8c5a"
  correction-clay: "#b35a4a"
  candle-canvas: "#0a0908"
  candle-surface: "#14120f"
  candle-muted: "#1c1814"
  candle-ink: "#f4f1ec"
  candle-marginalia: "#b8b0a4"
  candle-gold: "#c9a227"
  candle-plum: "#8b5a9e"
  candle-rule: "#2a2420"
typography:
  display:
    fontFamily: "Newsreader, Source Serif 4, Literata, Georgia, serif"
    fontSize: "1.65rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "normal"
  headline:
    fontFamily: "Newsreader, Source Serif 4, Literata, Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "normal"
  title:
    fontFamily: "Plus Jakarta Sans, -apple-system, BlinkMacSystemFont, SF Pro Text, sans-serif"
    fontSize: "1.05rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "normal"
  body:
    fontFamily: "Plus Jakarta Sans, -apple-system, BlinkMacSystemFont, SF Pro Text, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  assistant:
    fontFamily: "Newsreader, Source Serif 4, Literata, Georgia, serif"
    fontSize: "1.25rem"
    fontWeight: 400
    lineHeight: 1.72
    letterSpacing: "normal"
  label:
    fontFamily: "Plus Jakarta Sans, -apple-system, BlinkMacSystemFont, SF Pro Text, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.05em"
rounded:
  editorial: "6px"
  editorial-mobile: "10px"
  xs: "8px"
  sm: "10px"
  md: "12px"
  lg: "14px"
  xl: "18px"
spacing:
  one: "4px"
  two: "8px"
  three: "12px"
  four: "16px"
  five: "20px"
  six: "24px"
  seven: "28px"
  eight: "32px"
components:
  button-primary:
    backgroundColor: "{colors.tutor-gold}"
    textColor: "{colors.ink-brown}"
    rounded: "{rounded.editorial}"
    padding: "0 16px"
    height: "44px"
  button-outline:
    backgroundColor: "{colors.muted-vellum}"
    textColor: "{colors.ink-brown}"
    rounded: "{rounded.editorial}"
    padding: "0 16px"
    height: "44px"
  button-ghost:
    backgroundColor: "{colors.surface-paper}"
    textColor: "{colors.marginalia-brown}"
    rounded: "{rounded.editorial}"
    padding: "0 16px"
    height: "44px"
  card-editorial:
    backgroundColor: "{colors.surface-paper}"
    textColor: "{colors.ink-brown}"
    rounded: "{rounded.editorial}"
    padding: "16px"
  input-editorial:
    backgroundColor: "{colors.muted-vellum}"
    textColor: "{colors.ink-brown}"
    rounded: "{rounded.editorial}"
    padding: "0 12px"
    height: "40px"
---

# Design System: Dialogia

## 1. Overview

**Creative North Star: "The Tutor's Desk"**

Dialogia is a product surface for private learning, model exploration, and careful thought. Its
visual system should feel like sitting at a well-kept study desk: warm paper, clear annotations,
quiet tools, and a tutor who knows when to step forward. The interface is learned without being
ornate, capable without becoming a cockpit, and pleasant enough to use every day.

The tutor experience is the center of gravity. Chat, search, model selection, attachments,
reasoning controls, and metrics are all valuable, but they support the deeper promise: AI that makes
the user better. Every screen should help users read, ask, reflect, compare, and continue with less
friction.

Dialogia rejects generic AI chat wrappers, purple-gradient startup UI, neon or cyberpunk cues,
decorative glassmorphism, gamified learning noise, and dashboards that make learning feel like
analytics theater.

**Key Characteristics:**

- Editorial surfaces that privilege reading and sustained attention.
- Quiet power: advanced controls remain discoverable but visually secondary.
- Tutor-first hierarchy: progress, feedback, and next steps are clearer than provider machinery.
- Warm restraint: gold and plum accents are used as signals, not decoration.
- Trust-preserving states for privacy, ZDR, local storage, and provider routing.

## 2. Colors

The palette is warm, restrained, and archival: paper neutrals carry the interface while gold marks
primary tutor action and plum appears only for secondary emphasis or model intelligence.

### Primary

- **Tutor Gold**: The primary action and tutor-progress color. Use it for active tutor state, main
  calls to action, selected learning affordances, and rare highlights that deserve confidence.
- **Candle Gold**: The dark-mode equivalent of Tutor Gold. It should glow softly, never glare.

### Secondary

- **Scholar Plum**: A secondary accent for model intelligence, reasoning, comparisons, and advanced
  capability. Keep it rarer than gold.
- **Candle Plum**: The dark-mode equivalent of Scholar Plum.

### Tertiary

- **Success Sage**: Correctness, confirmed mastery, safe completion, and positive learning
  evidence.
- **Correction Clay**: Errors, misconceptions, failed validation, and destructive actions. It should
  feel corrective, not punitive.

### Neutral

- **Canvas Parchment**: The light-mode app background. It creates the reading-room atmosphere.
- **Surface Paper**: Primary panels, message surfaces, cards, popovers, and composer surfaces.
- **Muted Vellum**: Secondary fills, hover states, inset fields, and quiet grouping.
- **Ink Brown**: Primary light-mode text.
- **Marginalia Brown**: Secondary text, helper labels, timestamps, and muted controls.
- **Warm Rule**: Borders, dividers, and ornamental rules.
- **Candle Canvas**: The dark-mode app background.
- **Candle Surface**: Dark-mode panels and cards.
- **Candle Muted**: Dark-mode inset surfaces and hover fills.
- **Candle Ink**: Primary dark-mode text.
- **Candle Marginalia**: Secondary dark-mode text.
- **Candle Rule**: Dark-mode borders and dividers.

### Named Rules

**The Accent Rarity Rule.** Gold and plum should not compete. Gold means tutor/action/progress; plum
means model capability or secondary intelligence. If both appear in the same area, one must clearly
lead.

**The No Neon Rule.** Saturated color is forbidden for atmosphere. Color should feel printed,
lamplit, or annotated, never electric.

## 3. Typography

**Display Font:** Newsreader, Source Serif 4, Literata, Georgia, serif  
**Body Font:** Plus Jakarta Sans, SF Pro Text, system sans-serif  
**Label/Mono Font:** Plus Jakarta Sans for labels; JetBrains Mono for code and technical IDs

**Character:** The type pairing separates thought from control. Assistant and tutor content uses a
scholarly serif; user controls, settings, labels, and navigation use a clear sans.

### Hierarchy

- **Display** (500, 1.65rem, 1.3): Main page openings, welcome states, and major tutor moments.
- **Headline** (500, 1.5rem, 1.35): Panel headings, plan section titles, and high-importance
  educational surfaces.
- **Title** (600, 1.05rem, 1.4): Sidebar rows, settings groups, cards, tool summaries, and compact
  headers.
- **Assistant** (400, 1.25rem, 1.72): Main assistant and tutor prose. Keep line length near 65 to
  75 characters for reading comfort.
- **Body** (400, 1rem, 1.6): User text, settings copy, field descriptions, and general UI prose.
- **Label** (600, 0.75rem, 0.05em): Small labels, badges, section metadata, and low-volume
  annotations. Uppercase is allowed only when the label is short.

### Named Rules

**The Voice Split Rule.** Tutor and assistant prose is serif. Controls and user-authored interactive
surfaces are sans. Do not blur the distinction unless a component is explicitly mixing prose and
controls.

**The No Default Font Rule.** Never introduce Inter, Roboto, or bare system defaults as the visual
voice of the product.

## 4. Elevation

Dialogia uses a hybrid of tonal layering, fine borders, and warm ambient shadows. Depth should feel
like paper stacked on a desk, not floating glass. Shadows are structural: they clarify active
surfaces, overlays, and hovered controls.

### Shadow Vocabulary

- **Low Rule Shadow** (`0 1px 2px rgba(0, 0, 0, 0.06)`): Small controls, compact cards, and resting
  surfaces that need separation.
- **Panel Shadow** (`0 8px 24px rgba(0, 0, 0, 0.08)`): Popovers, drawers, and elevated panels.
- **High Shadow** (`0 24px 48px rgba(0, 0, 0, 0.12)`): Rare use for dialogs and major overlays.
- **Message Shadow** (`0 1px 2px rgba(120, 90, 50, 0.04), 0 4px 8px rgba(100, 80, 40, 0.03), 0 8px 24px rgba(80, 60, 30, 0.04)`):
  Warm message and tutor surfaces in light mode.

### Named Rules

**The Paper Stack Rule.** Use borders and tonal changes first. Add shadow only when a surface has a
reason to sit above another surface.

**The No Decorative Glass Rule.** Do not use blur, translucency, or frosted panels as default
decoration. Existing `glass` class names mean solid editorial surfaces, not glassmorphism.

## 5. Components

Components should feel tactile, editorial, and calm. A component earns visual weight by helping the
learner act, understand state, or recover from uncertainty.

### Buttons

- **Shape:** Print-like corners on desktop (6px), slightly softer on mobile (10px).
- **Primary:** Tutor Gold background with Ink Brown text, 44px height, horizontal padding from the
  spacing scale. Use for one dominant action per local surface.
- **Hover / Focus:** Hover brightens or warms the fill subtly. Focus uses a visible gold ring. Active
  states may move by 1px or scale very slightly.
- **Secondary / Ghost / Tertiary:** Outline buttons use muted fills and warm borders. Ghost buttons
  are transparent until hover and should remain visually quieter than primary actions.

### Chips

- **Style:** Compact, warm, and legible. Use muted fills, fine borders, and medium-weight sans labels.
- **State:** Selected chips should use a tinted gold fill or full-border emphasis. Do not use a thick
  side stripe to indicate state.

### Cards / Containers

- **Corner Style:** Editorial radius (6px) for desktop, mobile editorial radius (10px) for touch-heavy
  surfaces.
- **Background:** Surface Paper for primary surfaces, Muted Vellum for inset and secondary grouping.
- **Shadow Strategy:** Resting cards can use Low Rule Shadow or no shadow. Panels and overlays can
  use Panel Shadow.
- **Border:** Warm Rule at 1px. Use full borders, not one-sided accent bars.
- **Internal Padding:** Start at 16px, increase to 20px or 24px when the surface carries prose.

### Inputs / Fields

- **Style:** Muted Vellum fill, Warm Rule border, editorial radius, and sans text.
- **Focus:** Gold focus ring plus a slightly stronger border. Do not rely on color alone; preserve
  outline visibility.
- **Error / Disabled:** Correction Clay for error borders and helper text. Disabled states reduce
  opacity but keep text readable.

### Navigation

- **Style:** Navigation is quiet and compact. Sidebar rows, top-header controls, and mobile tabs
  should use muted text at rest, a full-border or background tint on hover, and clear selected state.
- **Mobile treatment:** Prioritize 44px targets, stable hit areas, and labels that do not wrap
  awkwardly.

### Tutor Surfaces

Tutor components are Dialogia's signature pattern. Learning plans, diagnostics, quizzes, confidence
sliders, and learner updates should read as annotations from a thoughtful tutor: structured, brief,
and supportive. Use numbered markers, labels, icons, full borders, and soft background tints. Thick
side-stripe accents are forbidden.

### Composer

The composer is the writing surface. It should be comfortable for speech-to-text cleanup, multiline
thought, attachments, search toggles, and tutor mode without making all controls equally loud. The
input area leads; tools gather around it.

## 6. Do's and Don'ts

### Do:

- **Do** make tutor mode feel central. Plan progress, diagnostics, misconceptions, and next steps
  should be clearer than provider machinery.
- **Do** keep advanced controls close but quiet. Model choice, search, reasoning, and privacy states
  should be visible when relevant and secondary otherwise.
- **Do** use Surface Paper, Muted Vellum, Warm Rule, and warm shadows to create reading comfort.
- **Do** maintain strong focus states, keyboard access, reduced-motion fallbacks, and mobile touch
  targets near 44px.
- **Do** interpret user text generously in UX copy. Speech-to-text messiness is normal input, not user
  failure.

### Don't:

- **Don't** make Dialogia feel like a generic AI chat wrapper.
- **Don't** use purple-gradient startup UI, neon/cyberpunk cues, or decorative glassmorphism.
- **Don't** make tutor mode feel like gamified noise or analytics theater.
- **Don't** use a `border-left` or `border-right` thicker than 1px as a colored accent on cards,
  callouts, tutor panels, or alerts.
- **Don't** use gradient text, decorative metric blocks, identical card grids, or modal-first flows.
- **Don't** let power-user controls become a cockpit. If every control has equal weight, the screen
  has failed.
