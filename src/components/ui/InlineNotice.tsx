import { CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';

export type InlineNoticeProps = {
  message: string;
  onDismiss?: () => void;
  role?: 'status' | 'alert';
  className?: string;
};

/** A toast: a slip of paper with a hairline; errors carry a crimson mark. */
export function InlineNotice({
  message,
  onDismiss,
  role = 'status',
  className,
}: InlineNoticeProps) {
  if (!message) return null;
  const isAlert = role === 'alert';
  const Icon = isAlert ? ExclamationCircleIcon : CheckCircleIcon;
  return (
    <div
      role={role}
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
