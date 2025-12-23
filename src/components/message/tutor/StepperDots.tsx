'use client';
import type { StepStatus } from '@/components/message/tutor/shared';

export function StepperDots<T>({
  items,
  activeIndex,
  resolveStatus,
  onSelect,
}: {
  items: T[];
  activeIndex: number;
  resolveStatus: (item: T, index: number) => StepStatus;
  onSelect: (index: number) => void;
}) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5">
      {items.map((item, idx) => {
        const status = resolveStatus(item, idx);
        const isActive = idx === activeIndex;

        let colorClass = 'bg-muted border-border';
        if (status === 'correct') colorClass = 'bg-emerald-500 border-emerald-500';
        else if (status === 'incorrect') colorClass = 'bg-rose-500 border-rose-500';
        else if (status === 'answered') colorClass = 'bg-primary/60 border-primary/60';
        else if (isActive) colorClass = 'bg-primary border-primary';

        return (
          <button
            type="button"
            key={idx}
            className={`h-2 w-2 rounded-full border transition-all duration-300 ${colorClass} ${
              isActive
                ? 'scale-125 ring-2 ring-primary/20 ring-offset-1'
                : 'opacity-70 hover:opacity-100'
            }`}
            onClick={() => onSelect(idx)}
            aria-label={`Go to item ${idx + 1}`}
          />
        );
      })}
    </div>
  );
}
