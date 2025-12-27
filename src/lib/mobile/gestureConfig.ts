/**
 * Gesture threshold configuration for mobile interactions.
 * Values tuned for natural, responsive touch behavior.
 */

/**
 * Swipe gesture thresholds
 */
export const SWIPE = {
  /** Pixels to fully reveal swipe actions */
  REVEAL_THRESHOLD: 80,

  /** Velocity (px/ms) for quick swipe to trigger */
  VELOCITY_THRESHOLD: 0.5,

  /** Pixels before snapping back vs completing swipe */
  SNAP_BACK_THRESHOLD: 40,

  /** Pixels of movement before locking scroll direction */
  DIRECTIONAL_LOCK: 10,

  /** Maximum swipe distance (prevents over-scroll) */
  MAX_DISTANCE: 120,

  /** Resistance factor when exceeding max distance */
  RESISTANCE: 0.4,
} as const;

/**
 * Collapsing header thresholds
 */
export const HEADER = {
  /** Pixels of scroll before header starts hiding */
  COLLAPSE_THRESHOLD: 60,

  /** Scroll velocity (px/ms) for quick hide */
  VELOCITY_THRESHOLD: 0.3,

  /** Pixels of upward scroll to reveal hidden header */
  REVEAL_THRESHOLD: 30,

  /** Header height in pixels */
  HEIGHT: 56,

  /** Debounce time (ms) for scroll events */
  DEBOUNCE: 16,
} as const;

/**
 * Bottom sheet thresholds
 */
export const SHEET = {
  /** Velocity (px/ms) to trigger dismiss */
  DISMISS_VELOCITY: 0.5,

  /** Percentage of height to trigger dismiss on release */
  DISMISS_THRESHOLD: 0.4,

  /** Snap points as percentage of viewport height */
  SNAP_POINTS: {
    full: 0.92,
    half: 0.5,
    peek: 0.25,
  },

  /** Handle drag area height */
  HANDLE_HEIGHT: 32,
} as const;

/**
 * Long press thresholds
 */
export const LONG_PRESS = {
  /** Milliseconds to trigger long press */
  DELAY: 400,

  /** Pixels of movement allowed before canceling */
  SLOP: 10,
} as const;

/**
 * Tab bar configuration
 */
export const TAB_BAR = {
  /** Height in pixels (excluding safe area) */
  HEIGHT: 56,

  /** Icon size in pixels */
  ICON_SIZE: 24,

  /** Center button size in pixels */
  CENTER_BUTTON_SIZE: 52,
} as const;

/**
 * Touch target minimums (accessibility)
 */
export const TOUCH = {
  /** Minimum touch target size */
  MIN_SIZE: 44,

  /** Comfortable touch target size */
  COMFORTABLE_SIZE: 48,

  /** Large touch target for primary actions */
  LARGE_SIZE: 56,
} as const;
