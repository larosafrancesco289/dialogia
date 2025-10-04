'use client';

export type InlineNoticeProps = {
  message: string;
  onDismiss?: () => void;
  role?: 'status' | 'alert';
  className?: string;
};

export default function InlineNotice({
  message,
  onDismiss,
  role = 'status',
  className,
}: InlineNoticeProps) {
  if (!message) return null;
  return (
    <div
      role={role}
      aria-live={role === 'alert' ? 'assertive' : 'polite'}
      aria-atomic="true"
      className={`card px-4 py-3 flex items-center gap-3 shadow-[var(--shadow-card)]${
        className ? ` ${className}` : ''
      }`}
    >
      <div className="text-sm">{message}</div>
      {onDismiss ? (
        <button className="btn btn-ghost btn-sm" onClick={onDismiss} type="button">
          Dismiss
        </button>
      ) : null}
    </div>
  );
}
