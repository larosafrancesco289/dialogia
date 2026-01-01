'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

function getConfidenceColor(value: number): string {
  if (value >= 0.7) return 'var(--color-success)';
  if (value >= 0.4) return 'var(--color-accent-2)';
  return 'var(--color-danger)';
}

function getConfidenceLabel(value: number): string {
  if (value >= 0.9) return 'Expert';
  if (value >= 0.7) return 'Proficient';
  if (value >= 0.5) return 'Developing';
  if (value >= 0.3) return 'Learning';
  return 'Beginner';
}

export function ConfidenceSlider({
  value,
  onChange,
  onChangeEnd,
  min = 0,
  max = 1,
  step = 0.01,
  showLabels = true,
  disabled = false,
}: {
  value: number;
  onChange: (value: number) => void;
  onChangeEnd?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  showLabels?: boolean;
  disabled?: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const trackRef = useRef<HTMLDivElement>(null);

  // Sync external value
  useEffect(() => {
    if (!isDragging) {
      setLocalValue(value);
    }
  }, [value, isDragging]);

  const calculateValue = useCallback(
    (clientX: number) => {
      if (!trackRef.current) return localValue;
      const rect = trackRef.current.getBoundingClientRect();
      const percentage = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const rawValue = min + percentage * (max - min);
      const steppedValue = Math.round(rawValue / step) * step;
      return Math.max(min, Math.min(max, steppedValue));
    },
    [min, max, step, localValue],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setIsDragging(true);
      const newValue = calculateValue(e.clientX);
      setLocalValue(newValue);
      onChange(newValue);
    },
    [disabled, calculateValue, onChange],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging || disabled) return;
      const newValue = calculateValue(e.clientX);
      setLocalValue(newValue);
      onChange(newValue);
    },
    [isDragging, disabled, calculateValue, onChange],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      setIsDragging(false);
      onChangeEnd?.(localValue);
    },
    [isDragging, localValue, onChangeEnd],
  );

  const percentage = ((localValue - min) / (max - min)) * 100;
  const displayValue = Math.round(localValue * 100);
  const color = getConfidenceColor(localValue);
  const label = getConfidenceLabel(localValue);

  return (
    <div className="space-y-2">
      {showLabels && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium" style={{ color: 'var(--color-fg-muted)' }}>
              Confidence
            </span>
            <span
              className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{
                background: `color-mix(in oklab, ${color} 15%, transparent)`,
                color: color,
                borderRadius: 'var(--radius-editorial)',
                border: `1px solid color-mix(in oklab, ${color} 30%, transparent)`,
              }}
            >
              {label}
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span
              className="text-lg font-bold tabular-nums"
              style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-mono)' }}
            >
              {displayValue}
            </span>
            <span className="text-xs" style={{ color: 'var(--color-fg-muted)' }}>
              %
            </span>
          </div>
        </div>
      )}

      {/* Slider Track */}
      <div
        ref={trackRef}
        className="relative h-3 cursor-pointer touch-none select-none"
        style={{
          background: 'var(--rule-light)',
          borderRadius: 'var(--radius-editorial)',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Progress Fill */}
        <motion.div
          className="absolute inset-y-0 left-0"
          style={{
            width: `${percentage}%`,
            background: `linear-gradient(90deg,
              color-mix(in oklab, ${color} 60%, var(--color-accent)) 0%,
              ${color} 100%)`,
            borderRadius: 'var(--radius-editorial)',
          }}
          layout
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />

        {/* Tick Marks */}
        <div className="absolute inset-0 flex items-center justify-between px-1 pointer-events-none">
          {[0, 0.4, 0.7, 1].map((tick) => (
            <div
              key={tick}
              className="w-px h-1.5"
              style={{
                background: localValue > tick ? 'rgba(255,255,255,0.5)' : 'var(--color-fg-muted)',
                opacity: 0.5,
              }}
            />
          ))}
        </div>

        {/* Thumb */}
        <motion.div
          className="absolute top-1/2 -translate-y-1/2"
          style={{
            left: `${percentage}%`,
            marginLeft: '-10px',
          }}
          layout
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        >
          <motion.div
            className="flex h-5 w-5 items-center justify-center"
            style={{
              background: 'var(--surface-paper)',
              border: `2px solid ${color}`,
              borderRadius: '50%',
              boxShadow: isDragging
                ? `0 0 0 4px color-mix(in oklab, ${color} 20%, transparent), var(--shadow-2)`
                : 'var(--shadow-1)',
            }}
            animate={{
              scale: isDragging ? 1.2 : 1,
            }}
            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
          >
            <div className="h-2 w-2 rounded-full" style={{ background: color }} />
          </motion.div>

          {/* Value Tooltip (on drag) */}
          <AnimatePresence>
            {isDragging && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-1 text-xs font-bold"
                style={{
                  background: color,
                  color: '#fff',
                  borderRadius: 'var(--radius-editorial)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {displayValue}%
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Zone Labels */}
      {showLabels && (
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>Needs work</span>
          <span>Developing</span>
          <span>Mastered</span>
        </div>
      )}
    </div>
  );
}
