import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  InformationCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import type { NoticeTone } from '@/lib/contracts/ui';
import { useT } from '@/lib/i18n';

export type InlineNoticeProps = {
  message: string;
  onDismiss?: () => void;
  tone?: NoticeTone;
  className?: string;
};

const ICONS = {
  info: InformationCircleIcon,
  success: CheckCircleIcon,
  error: ExclamationCircleIcon,
} as const;

/** A toast: a slip of paper with a hairline, its tone ruled down the left edge. */
export function InlineNotice({ message, onDismiss, tone = 'info', className }: InlineNoticeProps) {
  const t = useT();
  if (!message) return null;
  const isAlert = tone === 'error';
  const Icon = ICONS[tone];
  return (
    <div
      role={isAlert ? 'alert' : 'status'}
      aria-live={isAlert ? 'assertive' : 'polite'}
      aria-atomic="true"
      className={`toast toast--${tone}${className ? ` ${className}` : ''}`}
    >
      <Icon className="toast__icon" aria-hidden="true" />
      <div className="toast__message">{message}</div>
      {onDismiss ? (
        <button
          className="icon-button icon-button--sm"
          onClick={onDismiss}
          type="button"
          aria-label={t('common.dismiss')}
          title={t('common.dismiss')}
        >
          <XMarkIcon />
        </button>
      ) : null}
    </div>
  );
}
