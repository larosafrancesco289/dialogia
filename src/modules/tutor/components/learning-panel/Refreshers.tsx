import { useState } from 'react';
import { daysBetween } from '@/modules/tutor/engine';
import { Markdown } from '@/components/Markdown';
import { useT, type TutorTranslate } from '@/modules/tutor/i18n';

export type RefresherTopic = { id: string; name: string; studiedAt: number };

/** "Studied 9 days ago", in whole days. */
export function studiedAgo(t: TutorTranslate, studiedAt: number, now: number): string {
  const days = daysBetween(studiedAt, now);
  return days ? t('review.studied', { count: days }) : t('review.studiedToday');
}

/**
 * Topics studied a while ago that are due for a refresher, each with when it
 * was last studied, and one button that asks the tutor for it. The label above
 * names where they come from, when that is not plain from the place.
 */
export function RefresherBox({
  topics,
  now,
  onReview,
  from,
}: {
  topics: RefresherTopic[];
  now: number;
  onReview: () => Promise<unknown>;
  from?: string;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  if (!topics.length) return null;
  return (
    <section className="refresher" aria-label={from ?? t('review.title')}>
      {from && (
        <p className="refresher__from">
          <Markdown inline content={from} />
        </p>
      )}
      <ul className="refresher__topics">
        {topics.map((topic) => (
          <li key={topic.id}>
            <span className="refresher__name">
              <Markdown inline content={topic.name} />
            </span>
            <span className="refresher__when">{studiedAgo(t, topic.studiedAt, now)}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="btn btn-sm"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void onReview().finally(() => setBusy(false));
        }}
      >
        {t('review.now')}
      </button>
    </section>
  );
}
