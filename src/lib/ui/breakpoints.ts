export const BREAKPOINTS = {
  // Below this the app is the phone app: its own shell, touch rows and
  // sheets. A phone on its side is the phone app too (see PHONE_LANDSCAPE).
  mobile: 768,
  desktop: 1024,
  // Below this the sidebar, the chat and the right panel no longer fit side by
  // side with a readable chat column, so only one side panel stays open.
  sidePanels: 1280,
  // Shorter than this, on a touch screen, is a phone on its side: a tablet's
  // short side is 600px or more.
  phoneHeight: 500,
} as const;

export const maxWidthQuery = (breakpoint: number): string =>
  `(max-width: ${Math.max(breakpoint - 1, 0)}px)`;

/**
 * A phone on its side: wider than the phone breakpoint but short, with a
 * finger for a pointer. A short desktop window has a mouse; a tablet is
 * taller. The width cap keeps a tablet whose keyboard shortens the page
 * (Android resizes it) in its own layout.
 */
const PHONE_LANDSCAPE = `(pointer: coarse) and (max-height: ${BREAKPOINTS.phoneHeight - 1}px) and ${maxWidthQuery(BREAKPOINTS.desktop)}`;

export const MEDIA_QUERIES = {
  // The phone app. CSS says exactly this for the phone app, and its opposite
  // for everything wider; tests/breakpoints.test.ts holds the two together.
  mobile: `${maxWidthQuery(BREAKPOINTS.mobile)}, ${PHONE_LANDSCAPE}`,
  desktop: maxWidthQuery(BREAKPOINTS.desktop),
  sidePanels: maxWidthQuery(BREAKPOINTS.sidePanels),
  // A touch screen with no hovering pointer: a phone or tablet typing on its
  // on-screen keyboard, whatever its width.
  touch: '(hover: none) and (pointer: coarse)',
} as const;
