import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { resolveNotice } from '@/lib/store/notices';
import type { Message } from '@/lib/types';
import { useT } from '@/lib/i18n';

// Component: FailedReplyNotice
// Responsibility: A reply that failed, set apart from the replies that did
// not: what went wrong and what to do in the language shown, with the
// provider's own words kept behind a toggle for whoever wants them.

export function FailedReplyNotice({
  message,
  written,
}: {
  message: Pick<Message, 'cutOffReason' | 'cutOffDetail'>;
  /** Some of the reply came out before it failed. */
  written: boolean;
}) {
  const t = useT();
  const reason = resolveNotice(message.cutOffReason);
  return (
    <div className={written ? 'px-4 pb-3' : 'px-4 pt-3 pb-3'}>
      <div className="message-notice">
        <div className="flex items-start gap-2.5">
          <ExclamationTriangleIcon
            className="mt-0.5 h-4 w-4 shrink-0"
            style={{ color: 'var(--color-danger)' }}
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-semibold" style={{ color: 'var(--color-danger)' }}>
              {t(written ? 'ending.failed' : 'ending.nothing.failed')}
            </p>
            {reason && <p className="text-sm text-fg-muted">{reason}</p>}
            {message.cutOffDetail && (
              <details className="message-notice__details">
                <summary>{t('ending.details')}</summary>
                <p>{message.cutOffDetail}</p>
              </details>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
