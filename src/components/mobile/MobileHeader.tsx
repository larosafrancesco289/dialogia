import { useMemo } from 'react';
import { useChatStore } from '@/lib/store';
import { shallow } from 'zustand/shallow';
import { Bars2Icon, PencilSquareIcon } from '@heroicons/react/24/outline';
import { findModelById, formatModelLabel } from '@/lib/models';
import { ModelPicker } from '@/components/ModelPicker';
import { selectIsStreaming, selectIsTutorEnabled } from '@/lib/store/selectors';
import styles from './MobileHeader.module.css';

/**
 * MobileHeader: the phone's running head. The chats button on the left, the
 * chat's title in the book face with the model beneath it, and a new page on
 * the right, where every phone keeps its compose button.
 */
export function MobileHeader({
  drawerOpen,
  onOpenDrawer,
  onNewChat,
}: {
  drawerOpen: boolean;
  onOpenDrawer: () => void;
  onNewChat: () => void;
}) {
  const { chats, selectedChatId, models, isStreaming, tutorActive, tutorDefaultModelId } =
    useChatStore(
      (s) => ({
        chats: s.chats,
        selectedChatId: s.selectedChatId,
        models: s.models,
        isStreaming: selectIsStreaming(s),
        tutorActive: selectIsTutorEnabled(s),
        tutorDefaultModelId: s.ui.tutor?.defaultModelId,
      }),
      shallow,
    );

  const chat = chats.find((c) => c.id === selectedChatId);

  const tutorModelId =
    chat?.settings?.features.tutor?.defaultModelId ||
    chat?.settings?.modelId ||
    tutorDefaultModelId;
  const tutorModelMeta = useMemo(() => findModelById(models, tutorModelId), [models, tutorModelId]);
  const tutorModelLabel = useMemo(
    () =>
      tutorModelId ? formatModelLabel({ model: tutorModelMeta, fallbackId: tutorModelId }) : '',
    [tutorModelMeta, tutorModelId],
  );

  return (
    <header className={styles.header}>
      {/* The live gold thread under the head while a reply is coming in. */}
      {isStreaming && <div className={styles.activityBar} />}

      <button
        type="button"
        className={styles.iconButton}
        onClick={onOpenDrawer}
        aria-label="Open chats"
        aria-expanded={drawerOpen}
      >
        <Bars2Icon className="h-6 w-6" aria-hidden="true" />
      </button>

      <div className={styles.center}>
        <h1 className={styles.title}>{chat?.title || 'New chat'}</h1>

        {tutorActive ? (
          <div className={styles.tutorLine}>
            <span className={styles.tutorLabel}>Tutor</span>
            {/* The session is live, so its dot is gold, as on desktop. */}
            <span className={styles.liveDot} aria-hidden="true" />
            {tutorModelLabel && <span className={styles.tutorModel}>{tutorModelLabel}</span>}
          </div>
        ) : (
          <ModelPicker variant="sheet" className={styles.modelPicker} />
        )}
      </div>

      <button type="button" className={styles.iconButton} onClick={onNewChat} aria-label="New chat">
        <PencilSquareIcon className="h-[1.375rem] w-[1.375rem]" aria-hidden="true" />
      </button>
    </header>
  );
}
