import type { StepStatus } from '@/modules/tutor/components/message/shared';
import { useT } from '@/modules/tutor/i18n';

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
  const t = useT();
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
            aria-label={t('quiz.questionNumber', { number: idx + 1 })}
            aria-current={idx === activeIndex ? 'step' : undefined}
          />
        );
      })}
    </div>
  );
}
