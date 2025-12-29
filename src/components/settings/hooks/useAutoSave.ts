import { useCallback, useEffect, useRef, useState } from 'react';
import type { AutoSaveStatus } from '@/components/settings/AutoSaveToast';

export type UseAutoSaveOptions = {
  /** Debounce delay in ms (default: 500) */
  delay?: number;
  /** Callback to perform the save */
  onSave: () => void | Promise<void>;
  /** Callback when save fails */
  onError?: (error: Error) => void;
};

export type UseAutoSaveReturn = {
  /** Current save status */
  status: AutoSaveStatus;
  /** Mark the form as dirty, triggering a debounced save */
  markDirty: () => void;
  /** Force an immediate save */
  forceSave: () => Promise<void>;
  /** Reset status to idle */
  reset: () => void;
};

export function useAutoSave(options: UseAutoSaveOptions): UseAutoSaveReturn {
  const { delay = 500, onSave, onError } = options;

  const [status, setStatus] = useState<AutoSaveStatus>('idle');
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const isMountedRef = useRef(true);
  const onSaveRef = useRef(onSave);
  const onErrorRef = useRef(onError);

  // Keep refs up to date
  useEffect(() => {
    onSaveRef.current = onSave;
    onErrorRef.current = onError;
  }, [onSave, onError]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const performSave = useCallback(async () => {
    if (!isMountedRef.current) return;

    setStatus('saving');

    try {
      await onSaveRef.current();
      if (isMountedRef.current) {
        setStatus('saved');
      }
    } catch (err) {
      if (isMountedRef.current) {
        setStatus('error');
        onErrorRef.current?.(err instanceof Error ? err : new Error('Save failed'));
      }
    }
  }, []);

  const markDirty = useCallback(() => {
    // Clear any pending timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set pending status while waiting for debounce
    setStatus('idle');

    // Schedule the save
    timeoutRef.current = setTimeout(() => {
      performSave();
    }, delay);
  }, [delay, performSave]);

  const forceSave = useCallback(async () => {
    // Clear any pending timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    await performSave();
  }, [performSave]);

  const reset = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setStatus('idle');
  }, []);

  return {
    status,
    markDirty,
    forceSave,
    reset,
  };
}
