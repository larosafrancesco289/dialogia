import type { Ref } from 'react';
import { useChatStore } from '@/lib/store';
import { shallow } from 'zustand/shallow';
import { Bars2Icon, PlusIcon } from '@heroicons/react/24/outline';
import { ModelPicker } from '@/components/ModelPicker';
import { ModuleSlot } from '@/components/ModuleSlot';
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
  menuButtonRef,
}: {
  drawerOpen: boolean;
  onOpenDrawer: () => void;
  onNewChat: () => void;
  menuButtonRef?: Ref<HTMLButtonElement>;
}) {
  const { title, isStreaming, tutorActive } = useChatStore(
    (s) => ({
      title: s.chats.find((c) => c.id === s.selectedChatId)?.title,
      isStreaming: selectIsStreaming(s),
      tutorActive: selectIsTutorEnabled(s),
    }),
    shallow,
  );

  return (
    <header className={styles.header}>
      {/* The live gold thread under the head while a reply is coming in. */}
      {isStreaming && <div className={`${styles.activityBar} motion-fade`} />}

      <button
        ref={menuButtonRef}
        type="button"
        className={styles.iconButton}
        onClick={onOpenDrawer}
        aria-label="Open chats"
        aria-expanded={drawerOpen}
      >
        <Bars2Icon className="h-5 w-5" aria-hidden="true" />
      </button>

      <div className={styles.center}>
        <h1 className={styles.title}>{title || 'New chat'}</h1>

        {/* While a session is on, the module says what drives the chat. */}
        {tutorActive ? (
          <ModuleSlot slot="phoneHeaderLine" />
        ) : (
          <ModelPicker variant="sheet" className={styles.modelPicker} />
        )}
      </div>

      <button type="button" className={styles.iconButton} onClick={onNewChat} aria-label="New chat">
        <PlusIcon className="h-5 w-5" aria-hidden="true" />
      </button>
    </header>
  );
}
