import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useChatStore } from '@/lib/store';
import { shallow } from 'zustand/shallow';
import { springs } from '@/lib/mobile/springConfig';
import { findModelById, formatModelLabel } from '@/lib/models';
import { ModelPicker } from '@/components/ModelPicker';
import { selectIsStreaming, selectIsTutorEnabled } from '@/lib/store/selectors';
import styles from './MobileCollapsingHeader.module.css';

/**
 * MobileCollapsingHeader: the phone's running head, which collapses on
 * scroll. The chat title in the book face; beneath it the model picker, or
 * the tutor label while a session is on.
 */
export function MobileCollapsingHeader() {
  const { chats, selectedChatId, models, headerVisible, isStreaming, tutorActive } = useChatStore(
    (s) => ({
      chats: s.chats,
      selectedChatId: s.selectedChatId,
      models: s.models,
      headerVisible: s.ui.mobile.headerVisible,
      isStreaming: selectIsStreaming(s),
      tutorActive: selectIsTutorEnabled(s),
    }),
    shallow,
  );

  const uiState = useChatStore((s) => s.ui, shallow);
  const tutorDefaultModelId = uiState.tutor?.defaultModelId;

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
    <motion.header
      className={styles.header}
      initial={false}
      animate={{
        y: headerVisible ? 0 : -70,
        opacity: headerVisible ? 1 : 0,
      }}
      transition={springs.smooth}
    >
      {/* Activity indicator when streaming */}
      {isStreaming && <div className={styles.activityBar} />}

      <div className={styles.content}>
        {/* Center: Title and Model/Tutor */}
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
      </div>
    </motion.header>
  );
}
