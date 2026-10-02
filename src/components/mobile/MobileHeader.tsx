import type { Ref } from 'react';
import { useChatStore } from '@/lib/store';
import { shallow } from 'zustand/shallow';
import { Bars2Icon, DocumentPlusIcon } from '@heroicons/react/24/outline';
import { ModelPicker } from '@/components/ModelPicker';
import { ModuleSlot } from '@/components/ModuleSlot';
import {
  selectIsStreaming,
  selectIsTutorEnabled,
  selectOnWelcomePage,
} from '@/lib/store/selectors';
import { useAnyModelOffered } from '@/lib/hooks/useProviderKeys';
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
  const { hydrated, onWelcome, title, isStreaming, tutorActive } = useChatStore(
    (s) => ({
      hydrated: s.hydrated,
      onWelcome: selectOnWelcomePage(s),
      title: s.chats.find((c) => c.id === s.selectedChatId)?.title,
      isStreaming: selectIsStreaming(s),
      tutorActive: selectIsTutorEnabled(s),
    }),
    shallow,
  );
  // Nothing connected yet: the page is the welcome, and a new chat could not
  // be sent anything.
  const firstRun = useAnyModelOffered() === false && onWelcome;

  return (
    <header className={styles.header}>
      {/* The live gold thread under the head while a reply is coming in.
          Always there, so it can fade out as it faded in. */}
      <div className={styles.activityBar} data-live={isStreaming} aria-hidden="true" />

      <button
        ref={menuButtonRef}
        type="button"
        className={`icon-button icon-button--lg ${styles.iconButton}`}
        onClick={onOpenDrawer}
        aria-label="Open chats"
        aria-expanded={drawerOpen}
      >
        <Bars2Icon className="h-5 w-5" aria-hidden="true" />
      </button>

      <div className={styles.center}>
        {/* Nothing until the chats are read, so a reload never flashes "New chat". */}
        <h1 className={styles.title}>
          {hydrated ? title || (firstRun ? 'Dialogia' : 'New chat') : ''}
        </h1>

        {/* While a session is on, the module says what drives the chat. */}
        {tutorActive ? (
          <ModuleSlot slot="phoneHeaderLine" />
        ) : (
          <ModelPicker variant="sheet" className={styles.modelPicker} />
        )}
      </div>

      {firstRun ? (
        // Holds the column, so the title stays centred.
        <span />
      ) : (
        <button
          type="button"
          className={`icon-button icon-button--lg ${styles.iconButton}`}
          onClick={onNewChat}
          aria-label="New chat"
        >
          <DocumentPlusIcon className="h-5 w-5" aria-hidden="true" />
        </button>
      )}
    </header>
  );
}
