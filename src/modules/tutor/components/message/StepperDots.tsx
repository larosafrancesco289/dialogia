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
    <div className="step-dots">
      {items.map((item, idx) => {
        const status = resolveStatus(item, idx);
        const classes = ['step-dot'];
        if (status !== 'pending') classes.push(`is-${status}`);
        if (idx === activeIndex) classes.push('is-active');
        return (
          <button
            type="button"
            key={idx}
            className={classes.join(' ')}
            onClick={() => onSelect(idx)}
            aria-label={`Go to item ${idx + 1}`}
            aria-current={idx === activeIndex ? 'step' : undefined}
          />
        );
      })}
    </div>
  );
}
