import { useEffect, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import type { LearningRecord } from '@/lib/types';
import { displayChatTitle } from '@/lib/ui/chatTitle';
import { RefresherBox } from '@/modules/tutor/components/learning-panel/Refreshers';
import { LEDGER } from '@/modules/tutor/lib/ledger';
import { tutorLearningRecords } from '@/modules/tutor/lib/learningRecords';
import { useT } from '@/modules/tutor/i18n';
import { useLedger } from '@/modules/tutor/ui/ledger';
import { useNow } from '@/modules/tutor/ui/useNow';
import { useTutorToggle } from '@/modules/tutor/ui/useTutorToggle';

/** How many learning sessions the welcome page offers a refresher from. */
const SHOWN = 3;

/**
 * The tutor module's `welcomeBelow` slot: on a fresh page in Learn, the
 * topics from the learner's learning sessions that are due for a refresher,
 * each session with a Review now that opens it and asks the tutor. Read from
 * the same records as memory's Learning folder.
 */
export function WelcomeRefreshers() {
  const t = useT();
  const tutor = useTutorToggle();
  const now = useNow();
  const ledger = useLedger();
  const { chats, sessions, ensureTutorSession, selectChat, ensureChatMessagesLoaded } =
    useChatStore(
      (s) => ({
        chats: s.chats,
        sessions: s.tutorSessions,
        ensureTutorSession: s.ensureTutorSession,
        selectChat: s.selectChat,
        ensureChatMessagesLoaded: s.ensureChatMessagesLoaded,
      }),
      shallow,
    );
  const learning = tutor.available && tutor.active;
  const [records, setRecords] = useState<LearningRecord[]>([]);
  // Read again as the chats or their progress change, and as time passes.
  useEffect(() => {
    if (!learning) return;
    let live = true;
    tutorLearningRecords(chats, ensureTutorSession, now)
      .then((next) => live && setRecords(next))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [learning, chats, sessions, ensureTutorSession, now]);

  const due = records
    .map((record) => ({
      record,
      topics: record.topics.flatMap((topic, i) =>
        topic.dueForReview
          ? [{ id: String(i), name: topic.name, studiedAt: topic.lastStudiedAt ?? now }]
          : [],
      ),
    }))
    .filter((entry) => entry.topics.length > 0)
    .slice(0, SHOWN);
  if (!learning || !due.length) return null;

  const review = async (chatId: string, topics: string[]) => {
    selectChat(chatId);
    await ensureChatMessagesLoaded(chatId);
    await ledger(LEDGER.review(topics));
  };

  return (
    <div className="welcome-refresh">
      <p className="hub-label">{t('review.title')}</p>
      {due.map(({ record, topics }) => {
        const title = chats.find((chat) => chat.id === record.chatId)?.title;
        return (
          <RefresherBox
            key={record.chatId}
            topics={topics}
            now={now}
            from={title ? displayChatTitle(title) : record.goal}
            onReview={() =>
              review(
                record.chatId,
                topics.map((topic) => topic.name),
              )
            }
          />
        );
      })}
    </div>
  );
}
