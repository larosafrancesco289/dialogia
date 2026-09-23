export const BREAKPOINTS = {
  mobile: 640,
  tablet: 768,
  desktop: 1024,
  // Below this the sidebar, the chat and the right panel no longer fit side by
  // side with a readable chat column, so only one side panel stays open.
  sidePanels: 1280,
} as const;

export const maxWidthQuery = (breakpoint: number): string =>
  `(max-width: ${Math.max(breakpoint - 1, 0)}px)`;

export const MEDIA_QUERIES = {
  mobile: maxWidthQuery(BREAKPOINTS.mobile),
  tablet: maxWidthQuery(BREAKPOINTS.tablet),
  desktop: maxWidthQuery(BREAKPOINTS.desktop),
  sidePanels: maxWidthQuery(BREAKPOINTS.sidePanels),
} as const;
