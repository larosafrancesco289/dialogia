# Design

## What Dialogia is trying to be

Dialogia exists so that using a model makes the person better at something: a clearer thinker, a
stronger learner, a better asker of questions. Tutor mode is the centre of gravity. The flexible
chat surface matters too — models, routing, search, attachments, reasoning controls — but it serves
the same end.

Three words: **learned, unobtrusive, encouraging.** It should feel like a well-kept study desk, not
a SaaS dashboard: warm paper, clear annotations, quiet tools, and a tutor who knows when to step
forward.

**Anti-references.** Not a generic AI chat wrapper. Not purple-gradient startup UI, neon or
cyberpunk cues, or decorative glassmorphism. Not gamified learning noise or dashboards that make
learning feel like analytics theatre. Not a cockpit: if every control has equal weight, the screen
has failed.

### Principles

1. **Make the learner better, not merely answered.** Tutor interactions should reveal progress,
   misconceptions and next steps without becoming bureaucratic.
2. **Keep power close but quiet.** Model choice, search, reasoning, privacy and metrics should be
   discoverable and reversible, and visually secondary until needed.
3. **Preserve intellectual calm.** Long reading and revision sessions without visual fatigue.
4. **Prefer guidance over spectacle.** Motion, colour and components clarify state and attention;
   they do not perform intelligence.
5. **Be local-first and trust-preserving.** Privacy posture is visible where it matters and calm
   everywhere else.

## Tokens are the source of truth

`styles/tokens.css` holds every colour, radius, shadow, spacing step and easing curve. **Use tokens
and `color-mix`; never a hard-coded hex in a component.** The values below are described, not
listed — the CSS is authoritative and this document is not a second copy of it.

Two themes, one vocabulary. Light is **Imperial Archive**: parchment canvas, paper surfaces, ink
brown text, warm rules. Dark is **Candlelit Study**, a warm charcoal sibling built on three rules:

1. No pure black. The canvas is a warm dark grey so surfaces can lift by lightness, and gold glows
   instead of glaring.
2. Accents are lifted and slightly desaturated so they sit calmly on the dark ground.
3. Gold stays the rationed metal accent; purple stays the soft secondary.

`design/palette-explorer.html` is the scratchpad those decisions came out of.

### Colour

- **Accent (gold)** — primary action, tutor progress, active tutor state, selected learning
  affordances.
- **Accent 2 (plum)** — model intelligence, reasoning, comparison, advanced capability. Rarer than
  gold.
- **Success (sage)** — correctness, confirmed mastery, positive learning evidence.
- **Danger (clay)** — errors, misconceptions, failed validation, destructive actions. Corrective,
  not punitive.
- **Neutrals** — canvas, surface, muted, foreground, muted foreground, border.

**The Accent Rarity Rule.** Gold and plum must not compete. Gold means tutor, action, progress;
plum means model capability or secondary intelligence. Where both appear, one clearly leads.

**The No Neon Rule.** Saturated colour is forbidden as atmosphere. Colour should read printed,
lamplit, or annotated — never electric.

### Typography

Display serif (Newsreader) for assistant and tutor prose and for major headings. Sans (Plus Jakarta
Sans) for controls, settings, labels and navigation. JetBrains Mono for code and technical ids.

Roughly: display 1.65rem/500 for page openings, headline 1.5rem/500 for panel headings, title
1.05rem/600 for rows and cards, assistant 1.25rem/400 at 1.72 line-height for model prose, body
1rem/400 for UI copy, label 0.75rem/600 with 0.05em tracking for badges and metadata. Keep
assistant prose near 65–75 characters per line.

**The Voice Split Rule.** Tutor and assistant prose is serif; controls and user-authored surfaces
are sans. Do not blur the distinction unless a component genuinely mixes prose and controls.

**The No Default Font Rule.** Inter, Roboto and bare system defaults are never the visual voice of
this product.

### Elevation

Tonal layering, fine borders, and warm ambient shadows. Depth should feel like paper stacked on a
desk, not floating glass. Four shadow steps live in the tokens: a low rule shadow for resting
controls, a panel shadow for popovers and drawers, a high shadow reserved for dialogs, and a warm
layered message shadow.

**The Paper Stack Rule.** Reach for borders and tonal change first. Add shadow only when a surface
has a reason to sit above another surface.

**The No Decorative Glass Rule.** No blur, translucency or frosted panels as default decoration.
The existing `glass` class names mean solid editorial surfaces.

## Components

A component earns visual weight by helping the reader act, understand state, or recover from
uncertainty.

**Buttons.** Print-like corners on desktop (`--radius-editorial`, 6px), softer on mobile (10px).
Primary is gold on ink at 44px. One dominant action per local surface. Hover warms the fill; focus
shows a visible gold ring; active may move 1px. Outline buttons use muted fills and warm borders;
ghost buttons stay transparent until hover.

**Chips.** Compact, warm, medium-weight sans labels. Selected uses a tinted gold fill or full-border
emphasis — never a thick side stripe.

**Cards and containers.** Surface for primary, muted for inset grouping. 1px warm border, full
borders rather than one-sided accent bars. Resting cards take the low shadow or none; panels and
overlays take the panel shadow. Padding starts at 16px and grows to 20–24px when the surface carries
prose.

**Inputs.** Muted fill, warm border, editorial radius, sans text. Gold focus ring plus a stronger
border; never colour alone. Errors use clay for border and helper text; disabled reduces opacity but
keeps text readable.

**Navigation.** Quiet and compact. Muted text at rest, full-border or background tint on hover, a
clear selected state. On mobile, 44px targets and labels that do not wrap awkwardly.

**Tutor surfaces.** The signature pattern. Plans, diagnostics, quizzes, confidence indicators and
learner updates should read as annotations from a thoughtful tutor: structured, brief, supportive.
Numbered markers, labels, icons, full borders, soft background tints. Thick side-stripe accents are
forbidden.

**Composer.** The writing surface. Comfortable for multiline thought, speech-to-text cleanup,
attachments, search and tutor toggles — without making every control equally loud. The input leads;
tools gather around it.

## Motion

Motion clarifies state; it never performs.

- Respect the global reduced-motion kill switch in `styles/layout.css`, which covers
  pseudo-elements too. Framer-motion trees must sit under `MotionConfig reducedMotion="user"`
  (already wrapped in `HomeClient` and `MobileShell`).
- Infinite ambient animations must be pausable via the `.tab-hidden` class
  (`useAmbientMotionPause`).
- Collapsible panel bodies use the `panel-reveal` grid animation, not max-height hacks.
- Desktop side panels collapse via CSS width transitions on `.sidebar-slot` and
  `.right-panel-slot`. Do not reintroduce framer `layout` animations on the app shell.
- Theme state has one source of truth, `useThemeMode` (`src/lib/hooks/useThemeMode.ts`). Never read
  or write `localStorage.theme` from a component.

## Accessibility

Target WCAG AA: contrast, keyboard access, visible focus, readable type. Every core chat and tutor
workflow must remain usable with reduced motion, without relying on colour alone, and with touch
targets near 44px.

Copy should interpret user input generously. Speech-to-text messiness is normal input, not user
failure, and tutor feedback should be supportive and precise rather than punishing spelling,
phrasing or uncertainty.

## Don't

- Use a `border-left` or `border-right` thicker than 1px as a coloured accent on cards, callouts,
  tutor panels or alerts.
- Use gradient text, decorative metric blocks, identical card grids, or modal-first flows.
- Make provider machinery louder than learning progress.
