import type { StepStatus } from '@/modules/tutor/components/message/shared';

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

        // Use CSS custom properties for semantic colors
        let dotStyle: React.CSSProperties = {};
        let colorClass = 'bg-muted border-border';
        if (status === 'correct') {
          dotStyle = {
            backgroundColor: 'var(--color-success)',
            borderColor: 'var(--color-success)',
          };
          colorClass = '';
        } else if (status === 'incorrect') {
          dotStyle = { backgroundColor: 'var(--color-danger)', borderColor: 'var(--color-danger)' };
          colorClass = '';
        } else if (status === 'answered') {
          dotStyle = {
            backgroundColor: 'var(--color-accent)',
            borderColor: 'var(--color-accent)',
            opacity: 0.6,
          };
          colorClass = '';
        } else if (isActive) {
          dotStyle = { backgroundColor: 'var(--color-accent)', borderColor: 'var(--color-accent)' };
          colorClass = '';
        }

        return (
          <button
            type="button"
            key={idx}
            className={`h-2 w-2 rounded-full border transition-all duration-300 ${colorClass} ${
              isActive ? 'scale-125 ring-2 ring-offset-1' : 'opacity-70 hover:opacity-100'
            }`}
            style={{
              ...dotStyle,
              ...(isActive
                ? ({
                    '--tw-ring-color': 'color-mix(in oklab, var(--color-accent) 20%, transparent)',
                  } as React.CSSProperties)
                : {}),
            }}
            onClick={() => onSelect(idx)}
            aria-label={`Go to item ${idx + 1}`}
          />
        );
      })}
    </div>
  );
}
