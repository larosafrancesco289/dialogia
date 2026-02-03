export const BREAKPOINTS = {
  mobile: 640,
  tablet: 768,
  desktop: 1024,
} as const;

export const maxWidthQuery = (breakpoint: number): string =>
  `(max-width: ${Math.max(breakpoint - 1, 0)}px)`;

export const MEDIA_QUERIES = {
  mobile: maxWidthQuery(BREAKPOINTS.mobile),
  tablet: maxWidthQuery(BREAKPOINTS.tablet),
  desktop: maxWidthQuery(BREAKPOINTS.desktop),
} as const;
