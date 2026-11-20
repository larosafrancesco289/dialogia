import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { formatCost } from '@/components/message/MessageColophon';
import { repository } from '@/lib/db';
import type { UsageRecord } from '@/lib/db/repository';
import { useChatStore } from '@/lib/store';
import { computeUsageSummary, type UsageRange } from '@/lib/ui/usageSummary';
import { indexForKey } from '@/lib/ui/focus';
import { cn } from '@/lib/ui/cn';
import { useT, type MessageKey } from '@/lib/i18n';
import { formatNumber } from '@/lib/i18n/format';

const RANGES: ReadonlyArray<{ id: UsageRange; label: MessageKey }> = [
  { id: '7d', label: 'usage.range.7d' },
  { id: '30d', label: 'usage.range.30d' },
  { id: 'all', label: 'usage.range.all' },
];

const MAX_MODELS_SHOWN = 8;

function compactTokens(count: number): string {
  return formatNumber(
    count,
    count >= 1000 ? { notation: 'compact', maximumFractionDigits: 1 } : undefined,
  );
}

/**
 * Replies, tokens, and estimated spend across stored chats, computed directly
 * from IndexedDB without hydrating every chat's messages into the store.
 */
export function UsageSection() {
  const t = useT();
  const models = useChatStore((s) => s.models);
  const [range, setRange] = useState<UsageRange>('30d');
  const [records, setRecords] = useState<UsageRecord[] | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    let cancelled = false;
    void repository
      .loadUsageRecords()
      .then((list) => {
        if (!cancelled) setRecords(list);
      })
      .catch(() => {
        if (!cancelled) setRecords([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(
    () => computeUsageSummary(records ?? [], models, range),
    [models, range, records],
  );

  const onRangeKeyDown = (event: KeyboardEvent, index: number) => {
    const next = indexForKey(event.key, index, RANGES.length, 'both');
    if (next === null) return;
    event.preventDefault();
    setRange(RANGES[next].id);
    optionRefs.current[next]?.focus();
  };

  const totalTokens = summary.tokensIn + summary.tokensOut;
  const zeroMoney = formatNumber(0, {
    style: 'currency',
    currency: summary.currency.toUpperCase(),
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <SettingsSection title={t('settings.section.usage')}>
      <div className="settings-row">
        <div className="settings-row-label">
          <div className="settings-row-label-text">{t('usage.period')}</div>
          <div className="settings-row-label-description">{t('usage.estimateHint')}</div>
        </div>
        <div className="settings-row-control">
          <div className="segmented" role="radiogroup" aria-label={t('usage.period')}>
            {RANGES.map((option, index) => (
              <button
                key={option.id}
                ref={(el) => {
                  optionRefs.current[index] = el;
                }}
                type="button"
                role="radio"
                aria-checked={range === option.id}
                tabIndex={range === option.id ? 0 : -1}
                className={cn('segment', range === option.id && 'is-active')}
                onClick={() => setRange(option.id)}
                onKeyDown={(event) => onRangeKeyDown(event, index)}
              >
                {t(option.label)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {records === null ? null : summary.replies === 0 ? (
        <p className="settings-empty">{t('usage.empty')}</p>
      ) : (
        <>
          <dl className="usage-summary">
            <div className="usage-summary__item">
              <dt className="usage-summary__label">{t('usage.spend')}</dt>
              <dd className="usage-summary__value">
                {summary.pricedReplies === 0
                  ? '—'
                  : summary.totalCost > 0
                    ? formatCost(summary.totalCost, summary.currency)
                    : zeroMoney}
              </dd>
            </div>
            <div className="usage-summary__item">
              <dt className="usage-summary__label">{t('usage.replies')}</dt>
              <dd className="usage-summary__value">{formatNumber(summary.replies)}</dd>
            </div>
            <div className="usage-summary__item">
              <dt className="usage-summary__label">{t('usage.tokens')}</dt>
              <dd className="usage-summary__value">{compactTokens(totalTokens)}</dd>
              {totalTokens > 0 && (
                <dd className="usage-summary__sub">
                  {t('usage.tokensDetail', {
                    inCount: compactTokens(summary.tokensIn),
                    outCount: compactTokens(summary.tokensOut),
                  })}
                </dd>
              )}
            </div>
          </dl>

          {summary.byModel.length > 0 && (
            <ul className="settings-list">
              {summary.byModel.slice(0, MAX_MODELS_SHOWN).map((row) => {
                const rowTokens = row.tokensIn + row.tokensOut;
                return (
                  <li key={row.modelId || '__unknown__'} className="settings-list__row">
                    <span className="min-w-0">
                      <span className="settings-list__name">
                        {row.label || t('usage.unknownModel')}
                      </span>
                      <span className="settings-list__meta">
                        {rowTokens > 0
                          ? t('usage.modelMetaWithTokens', {
                              replies: t('usage.replyCount', { count: row.replies }),
                              tokens: compactTokens(rowTokens),
                            })
                          : t('usage.replyCount', { count: row.replies })}
                      </span>
                    </span>
                    <span className="usage-list__cost">
                      {row.pricedReplies === 0
                        ? '—'
                        : row.cost > 0
                          ? formatCost(row.cost, row.currency)
                          : zeroMoney}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </SettingsSection>
  );
}
