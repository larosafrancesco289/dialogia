import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import type { NoticeTone } from '@/lib/contracts/ui';

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

/** A toast: a slip of paper with a hairline. Only a problem carries the crimson mark. */
export function InlineNotice({ message, onDismiss, tone = 'info', className }: InlineNoticeProps) {
  if (!message) return null;
  const isAlert = tone === 'error';
  const Icon = ICONS[tone];
  return (
    <div
      role={isAlert ? 'alert' : 'status'}
      aria-live={isAlert ? 'assertive' : 'polite'}
      aria-atomic="true"
      className={`toast${isAlert ? ' toast--error' : ''}${className ? ` ${className}` : ''}`}
    >
      <Icon className="toast__icon" aria-hidden="true" />
      <div className="toast__message">{message}</div>
      {onDismiss ? (
        <button className="btn-ghost btn-sm" onClick={onDismiss} type="button">
          Dismiss
        </button>
      ) : null}
    </div>
  );
}
