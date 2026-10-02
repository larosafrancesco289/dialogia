import { ArrowUpRightIcon, CheckIcon } from '@heroicons/react/24/outline';
import { shortDate } from '@/lib/ui/shortDate';
import { useChatStore } from '@/lib/store';
import type { LearningRecord } from '@/lib/types';
import { useOpenChat } from '@/components/memory/MemoryNotes';

/**
 * A tutor chat in memory's Learning folder: its goal and a small copy of the
 * Hub's path, read live from the chat, so it can never disagree with the Hub.
 */
function RecordView({ record }: { record: LearningRecord }) {
  const title = useChatStore((s) => s.chats.find((chat) => chat.id === record.chatId)?.title);
  const openChat = useOpenChat();
  const done = record.topics.filter((topic) => topic.state === 'done').length;
  return (
    <article className="memory-record">
      <button
        type="button"
        className="memory-record__title"
        onClick={() => openChat(record.chatId)}
      >
        {title || record.goal}
        <ArrowUpRightIcon className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {record.goal && title && <p className="memory-record__goal">{record.goal}</p>}
      <p className="memory-record__meta">
        {record.finished
          ? `Finished ${shortDate(record.studiedAt)}`
          : `${done} of ${record.topics.length} done · last studied ${shortDate(record.studiedAt)}`}
      </p>
      <ol className="memory-path">
        {record.topics.map((topic, index) => (
          <li key={`${index}-${topic.name}`} className={`memory-path__step is-${topic.state}`}>
            <span className="memory-path__dot" aria-hidden="true">
              {topic.state === 'done' ? <CheckIcon /> : index + 1}
            </span>
            <span className="memory-path__name">
              {topic.name}
              {topic.percent === undefined && (
                <span className="memory-path__status">{topic.status}</span>
              )}
            </span>
            {topic.percent !== undefined && (
              <>
                <span className="memory-path__meter" aria-hidden="true">
                  <span style={{ transform: `scaleX(${topic.percent / 100})` }} />
                </span>
                <span className="memory-path__pct">
                  {topic.percent}%<span className="sr-only">, {topic.status}</span>
                </span>
              </>
            )}
          </li>
        ))}
      </ol>
    </article>
  );
}

/**
 * Records under their subject, subjects in the order their latest chat was
 * studied; a chat whose plan names no subject stands on its own.
 */
function bySubject(records: LearningRecord[]): { subject?: string; records: LearningRecord[] }[] {
  const groups: { subject?: string; records: LearningRecord[] }[] = [];
  for (const record of records) {
    const key = record.subject?.trim().toLowerCase();
    const group = key && groups.find((g) => g.subject?.trim().toLowerCase() === key);
    if (group) group.records.push(record);
    else groups.push({ subject: record.subject?.trim() || undefined, records: [record] });
  }
  return groups;
}

export function LearningRecords({ records }: { records: LearningRecord[] }) {
  if (!records.length) return null;
  return (
    <section className="memory-records" aria-label="Learning sessions">
      <p className="memory-hint">
        Learning sessions appear here on their own, with their progress read live from the chat.
      </p>
      {bySubject(records).map((group, i) => (
        <div key={group.subject ?? `alone-${i}`} className="memory-subject">
          {group.subject && <h4 className="memory-subject__name">{group.subject}</h4>}
          {group.records.map((record) => (
            <RecordView key={record.chatId} record={record} />
          ))}
        </div>
      ))}
    </section>
  );
}
