export const BREAKPOINTS = {
  // Below this the app is the phone app: its own shell, touch rows and
  // sheets. CSS says the same thing as `(max-width: 767px)`.
  mobile: 768,
  desktop: 1024,
  // Below this the sidebar, the chat and the right panel no longer fit side by
  // side with a readable chat column, so only one side panel stays open.
  sidePanels: 1280,
} as const;

export const maxWidthQuery = (breakpoint: number): string =>
  `(max-width: ${Math.max(breakpoint - 1, 0)}px)`;

export const MEDIA_QUERIES = {
  mobile: maxWidthQuery(BREAKPOINTS.mobile),
  desktop: maxWidthQuery(BREAKPOINTS.desktop),
  sidePanels: maxWidthQuery(BREAKPOINTS.sidePanels),
  // A touch screen with no hovering pointer: a phone or tablet typing on its
  // on-screen keyboard, whatever its width.
  touch: '(hover: none) and (pointer: coarse)',
} as const;
