import { useCallback, useMemo } from 'react';

/**
 * Haptic feedback intensities
 */
export type HapticIntensity = 'light' | 'medium' | 'heavy';

/**
 * Haptic feedback hook for mobile interactions.
 * Uses the Vibration API with graceful fallback for unsupported devices.
 *
 * @example
 * const { light, medium, heavy } = useHaptics();
 *
 * // On button tap
 * onClick={() => { light(); handleClick(); }}
 *
 * // On destructive action
 * onDelete={() => { heavy(); performDelete(); }}
 */
export function useHaptics() {
  const isSupported = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    return 'vibrate' in navigator;
  }, []);

  /**
   * Light haptic - for subtle feedback
   * Use for: tab taps, swipe threshold crossed, toggle changes
   */
  const light = useCallback(() => {
    if (isSupported) {
      navigator.vibrate(10);
    }
  }, [isSupported]);

  /**
   * Medium haptic - for action confirmation
   * Use for: action triggers, sheet opened, selection made
   */
  const medium = useCallback(() => {
    if (isSupported) {
      navigator.vibrate(25);
    }
  }, [isSupported]);

  /**
   * Heavy haptic - for significant feedback
   * Use for: destructive actions, errors, important confirmations
   */
  const heavy = useCallback(() => {
    if (isSupported) {
      navigator.vibrate(40);
    }
  }, [isSupported]);

  /**
   * Custom vibration pattern
   * @param pattern - Array of [vibrate, pause, vibrate, pause, ...] in ms
   */
  const pattern = useCallback(
    (sequence: number[]) => {
      if (isSupported) {
        navigator.vibrate(sequence);
      }
    },
    [isSupported],
  );

  /**
   * Success pattern - two quick taps
   */
  const success = useCallback(() => {
    if (isSupported) {
      navigator.vibrate([15, 50, 15]);
    }
  }, [isSupported]);

  /**
   * Error pattern - one long vibration
   */
  const error = useCallback(() => {
    if (isSupported) {
      navigator.vibrate(100);
    }
  }, [isSupported]);

  /**
   * Warning pattern - three quick taps
   */
  const warning = useCallback(() => {
    if (isSupported) {
      navigator.vibrate([10, 30, 10, 30, 10]);
    }
  }, [isSupported]);

  /**
   * Stop any ongoing vibration
   */
  const stop = useCallback(() => {
    if (isSupported) {
      navigator.vibrate(0);
    }
  }, [isSupported]);

  /**
   * Generic haptic trigger by intensity
   */
  const trigger = useCallback(
    (intensity: HapticIntensity) => {
      switch (intensity) {
        case 'light':
          light();
          break;
        case 'medium':
          medium();
          break;
        case 'heavy':
          heavy();
          break;
      }
    },
    [light, medium, heavy],
  );

  return {
    isSupported,
    light,
    medium,
    heavy,
    pattern,
    success,
    error,
    warning,
    stop,
    trigger,
  };
}

/**
 * Standalone haptic trigger for use outside React components.
 * Checks support on each call.
 */
export function triggerHaptic(intensity: HapticIntensity = 'light') {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;

  const durations: Record<HapticIntensity, number> = {
    light: 10,
    medium: 25,
    heavy: 40,
  };

  navigator.vibrate(durations[intensity]);
}
