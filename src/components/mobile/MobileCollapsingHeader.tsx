'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useChatStore } from '@/lib/store';
import { shallow } from 'zustand/shallow';
import { springs } from '@/lib/mobile/springConfig';
import { findModelById, formatModelLabel } from '@/lib/models';
import { ModelPicker } from '@/components/ModelPicker';
import { AcademicCapIcon } from '@heroicons/react/24/outline';
import { useTier } from '@/lib/auth/tierContext';
import { DEFAULT_FREE_TUTOR_MODEL_ID, FREE_MODEL_IDS } from '@/data/freeModels';
import { selectIsStreaming, selectIsTutorEnabled } from '@/lib/store/selectors';
import styles from './MobileCollapsingHeader.module.css';

/**
 * MobileCollapsingHeader - Minimal header that collapses on scroll.
 *
 * Shows:
 * - Chat title or "New chat"
 * - Model picker or Tutor badge
 */
export function MobileCollapsingHeader() {
  const { isFreeTier } = useTier();

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
  const tutorDefaultModelId = uiState.tutor.defaultModelId;

  const chat = chats.find((c) => c.id === selectedChatId);

  // Resolve tutor model with tier awareness
  const rawTutorModelId =
    chat?.settings?.features.tutor.defaultModelId || chat?.settings?.modelId || tutorDefaultModelId;
  const tutorModelId = useMemo(() => {
    if (isFreeTier && rawTutorModelId && !FREE_MODEL_IDS.includes(rawTutorModelId)) {
      return DEFAULT_FREE_TUTOR_MODEL_ID;
    }
    return rawTutorModelId;
  }, [isFreeTier, rawTutorModelId]);
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
            <div className={styles.tutorBadge}>
              <AcademicCapIcon className="h-3.5 w-3.5" />
              <span>Tutor</span>
              {tutorModelLabel && <span className={styles.tutorModel}>({tutorModelLabel})</span>}
            </div>
          ) : (
            <ModelPicker variant="sheet" className={styles.modelPicker} />
          )}
        </div>
      </div>

      {/* Gold accent rule */}
      <div className={styles.accentRule} />
    </motion.header>
  );
}
